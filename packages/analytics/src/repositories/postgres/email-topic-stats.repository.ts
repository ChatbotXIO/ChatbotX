import type { DatabaseClient } from "@chatbotx.io/database/client"
import { and, db, eq, isNull, sql } from "@chatbotx.io/database/client"
import {
  analyticsEmailTopicModel,
  emailTopicModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"

export type CreateEmailRecipientInput = {
  /** Omit for an email sent without a topic ("No Topic"). */
  topicId?: string | null
  workspaceId: string
  email: string
  contactId?: string | null
  conversationId?: string | null
  contactInboxId?: string | null
}

// Denormalized columns on EmailTopic — each holds a UNIQUE (deduped) count.
export type EmailTopicCounter =
  | "sendsTotal"
  | "deliveredsTotal"
  | "seensTotal"
  | "clicksTotal"

// First-time-only timestamps on a recipient row.
type FirstEventColumn = "deliveredAt" | "firstSeenAt" | "firstClickedAt"

/**
 * A topic counter bump a write is owed. Returned instead of applied so the
 * caller can run it as the LAST statement of its transaction: the counter is
 * one hot row per topic, shared by every recipient of a campaign, and a topic
 * delete locks that row first, so holding it for the whole transaction would
 * serialize sends and invite a lock-order deadlock.
 */
export type EmailTopicCounterIncrement = {
  counter: EmailTopicCounter
  topicId: string
  workspaceId: string
}

/** The first time a recipient reached a phase; later repeats return null. */
export type EmailRecipientTransition = {
  /** Null once the topic was deleted: there is no counter left to bump. */
  counterIncrement: EmailTopicCounterIncrement | null
  contactId: string | null
  occurredAt: Date
  /**
   * The topic the email was sent under, kept after the topic is deleted
   * (`topicId` is then NULL). Null for an email sent without a topic.
   * Rows created before the snapshot column fall back to the live topic id.
   */
  topicReferenceId: string | null
  workspaceId: string
}

export type CreatedEmailRecipient = {
  /** Null for an email sent without a topic. */
  counterIncrement: EmailTopicCounterIncrement | null
  contactId: string | null
  token: string
  topicReferenceId: string | null
  workspaceId: string
}

export class EmailTopicStatsRepository {
  /**
   * Always writes the recipient row (its token drives open/click tracking).
   * The topic's `sendsTotal` is owed only when the email has a topic; the
   * caller applies it via `incrementTopicCounter`.
   */
  async createRecipient(
    input: CreateEmailRecipientInput,
    client?: DatabaseClient,
  ): Promise<CreatedEmailRecipient> {
    const token = crypto.randomUUID()
    const topicId = input.topicId ?? null
    const write = async (tx: DatabaseClient) => {
      await tx.insert(analyticsEmailTopicModel).values({
        id: createId(),
        token,
        topicId,
        topicReferenceId: topicId,
        workspaceId: input.workspaceId,
        email: input.email,
        contactId: input.contactId ?? null,
        conversationId: input.conversationId ?? null,
        contactInboxId: input.contactInboxId ?? null,
      })
    }
    await (client ? write(client) : db.transaction(write))
    return {
      counterIncrement: topicId
        ? {
            counter: "sendsTotal",
            topicId,
            workspaceId: input.workspaceId,
          }
        : null,
      contactId: input.contactId ?? null,
      token,
      topicReferenceId: topicId,
      workspaceId: input.workspaceId,
    }
  }

  markFailed(token: string): Promise<unknown> {
    return db
      .update(analyticsEmailTopicModel)
      .set({ failedAt: sql`now()` })
      .where(eq(analyticsEmailTopicModel.token, token))
  }

  // Delivery is itself a first-time-only transition → bumps deliveredsTotal once.
  markDelivered(
    token: string,
    client: DatabaseClient = db,
  ): Promise<EmailRecipientTransition | null> {
    return this.transitionOnce(token, "deliveredAt", "deliveredsTotal", client)
  }

  async recordOpen(
    token: string,
    client: DatabaseClient = db,
  ): Promise<EmailRecipientTransition | null> {
    await this.countRaw(token, "seenCount", "lastSeenAt", client)
    return await this.transitionOnce(token, "firstSeenAt", "seensTotal", client)
  }

  async recordClick(
    token: string,
    client: DatabaseClient = db,
  ): Promise<EmailRecipientTransition | null> {
    await this.countRaw(token, "clickCount", "lastClickedAt", client)
    return await this.transitionOnce(
      token,
      "firstClickedAt",
      "clicksTotal",
      client,
    )
  }

  /** Always: increment the raw repeat counter and refresh its "last" timestamp. */
  private countRaw(
    token: string,
    countColumn: "seenCount" | "clickCount",
    lastColumn: "lastSeenAt" | "lastClickedAt",
    client: DatabaseClient,
  ): Promise<unknown> {
    return client
      .update(analyticsEmailTopicModel)
      .set({
        [countColumn]: sql`${analyticsEmailTopicModel[countColumn]} + 1`,
        [lastColumn]: sql`now()`,
      })
      .where(eq(analyticsEmailTopicModel.token, token))
  }

  /**
   * Set firstColumn only if still null, and on that one transition bump the
   * deduped EmailTopic counter. The isNull guard makes it idempotent under
   * concurrent requests — the unique bump fires at most once.
   */
  private async transitionOnce(
    token: string,
    firstColumn: FirstEventColumn,
    counter: EmailTopicCounter,
    client: DatabaseClient,
  ): Promise<EmailRecipientTransition | null> {
    const [row] = await client
      .update(analyticsEmailTopicModel)
      .set({ [firstColumn]: sql`now()` })
      .where(
        and(
          eq(analyticsEmailTopicModel.token, token),
          isNull(analyticsEmailTopicModel[firstColumn]),
        ),
      )
      .returning({
        contactId: analyticsEmailTopicModel.contactId,
        occurredAt: analyticsEmailTopicModel[firstColumn],
        topicId: analyticsEmailTopicModel.topicId,
        topicReferenceId: analyticsEmailTopicModel.topicReferenceId,
        workspaceId: analyticsEmailTopicModel.workspaceId,
      })
    if (!row) {
      return null
    }

    return {
      // topicId is NULL once the topic was deleted: the transition is still
      // recorded, but there is no topic counter left to increment.
      counterIncrement: row.topicId
        ? { counter, topicId: row.topicId, workspaceId: row.workspaceId }
        : null,
      contactId: row.contactId,
      occurredAt: row.occurredAt ?? new Date(),
      topicReferenceId: row.topicReferenceId ?? row.topicId,
      workspaceId: row.workspaceId,
    }
  }

  /** Applies an owed counter bump; call it last in the transaction. */
  incrementTopicCounter(
    increment: EmailTopicCounterIncrement,
    client: DatabaseClient = db,
  ): Promise<unknown> {
    return client
      .update(emailTopicModel)
      .set({
        [increment.counter]: sql`${emailTopicModel[increment.counter]} + 1`,
      })
      .where(
        and(
          eq(emailTopicModel.id, increment.topicId),
          eq(emailTopicModel.workspaceId, increment.workspaceId),
        ),
      )
  }
}

export const emailTopicStatsRepository = new EmailTopicStatsRepository()
