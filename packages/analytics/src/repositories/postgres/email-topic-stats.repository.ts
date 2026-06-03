import { randomUUID } from "node:crypto"
import type { DatabaseClient } from "@chatbotx.io/database/client"
import { and, db, eq, isNull, sql } from "@chatbotx.io/database/client"
import {
  analyticsEmailTopicModel,
  emailTopicModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"

export type CreateEmailRecipientInput = {
  topicId: string
  workspaceId: string
  email: string
  contactId?: string | null
  conversationId?: string | null
  contactInboxId?: string | null
}

// Denormalized columns on EmailTopic — each holds a UNIQUE (deduped) count.
type EmailTopicCounter =
  | "sendsTotal"
  | "deliveredsTotal"
  | "seensTotal"
  | "clicksTotal"

// First-time-only timestamps on a recipient row.
type FirstEventColumn = "deliveredAt" | "firstSeenAt" | "firstClickedAt"

export class EmailTopicStatsRepository {
  async createRecipient(
    input: CreateEmailRecipientInput,
  ): Promise<{ token: string }> {
    const token = randomUUID()
    await db.transaction(async (tx) => {
      await tx.insert(analyticsEmailTopicModel).values({
        id: createId(),
        token,
        topicId: input.topicId,
        workspaceId: input.workspaceId,
        email: input.email,
        contactId: input.contactId ?? null,
        conversationId: input.conversationId ?? null,
        contactInboxId: input.contactInboxId ?? null,
      })
      await this.incrementCounter(
        input.topicId,
        input.workspaceId,
        "sendsTotal",
        tx,
      )
    })
    return { token }
  }

  markFailed(token: string): Promise<unknown> {
    return db
      .update(analyticsEmailTopicModel)
      .set({ failedAt: sql`now()` })
      .where(eq(analyticsEmailTopicModel.token, token))
  }

  // Delivery is itself a first-time-only transition → bumps deliveredsTotal once.
  markDelivered(token: string): Promise<void> {
    return this.transitionOnce(token, "deliveredAt", "deliveredsTotal")
  }

  async recordOpen(token: string): Promise<void> {
    await this.countRaw(token, "seenCount", "lastSeenAt")
    await this.transitionOnce(token, "firstSeenAt", "seensTotal")
  }

  async recordClick(token: string): Promise<void> {
    await this.countRaw(token, "clickCount", "lastClickedAt")
    await this.transitionOnce(token, "firstClickedAt", "clicksTotal")
  }

  /** Always: increment the raw repeat counter and refresh its "last" timestamp. */
  private countRaw(
    token: string,
    countColumn: "seenCount" | "clickCount",
    lastColumn: "lastSeenAt" | "lastClickedAt",
  ): Promise<unknown> {
    return db
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
  ): Promise<void> {
    const [row] = await db
      .update(analyticsEmailTopicModel)
      .set({ [firstColumn]: sql`now()` })
      .where(
        and(
          eq(analyticsEmailTopicModel.token, token),
          isNull(analyticsEmailTopicModel[firstColumn]),
        ),
      )
      .returning({
        topicId: analyticsEmailTopicModel.topicId,
        workspaceId: analyticsEmailTopicModel.workspaceId,
      })
    if (row) {
      await this.incrementCounter(row.topicId, row.workspaceId, counter)
    }
  }

  private incrementCounter(
    topicId: string,
    workspaceId: string,
    counter: EmailTopicCounter,
    tx: DatabaseClient = db,
  ): Promise<unknown> {
    return tx
      .update(emailTopicModel)
      .set({ [counter]: sql`${emailTopicModel[counter]} + 1` })
      .where(
        and(
          eq(emailTopicModel.id, topicId),
          eq(emailTopicModel.workspaceId, workspaceId),
        ),
      )
  }
}

export const emailTopicStatsRepository = new EmailTopicStatsRepository()
