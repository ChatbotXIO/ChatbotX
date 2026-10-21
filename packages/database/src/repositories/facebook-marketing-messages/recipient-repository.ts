import {
  and,
  asc,
  type DatabaseClient,
  db,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "../../client"
import type { FacebookMarketingMessageRecipientStatus } from "../../partials/facebook-marketing-messages"
import {
  facebookMarketingMessageModel as campaign,
  facebookMarketingMessageRecipientModel as recipient,
} from "../../schema"
import type {
  FacebookMarketingMessageRecipientModel,
  NewFacebookMarketingMessageRecipient,
} from "../../types"

type RecipientPatch = Partial<
  Omit<
    NewFacebookMarketingMessageRecipient,
    "id" | "workspaceId" | "campaignRowId" | "subscriptionToken"
  >
>

export const facebookMarketingMessageRecipientRepository = {
  /** Returns the number of rows actually inserted (duplicates are skipped). */
  async insertMany(
    rows: NewFacebookMarketingMessageRecipient[],
    tx: DatabaseClient = db,
  ): Promise<number> {
    if (rows.length === 0) {
      return 0
    }
    const inserted = await tx
      .insert(recipient)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: recipient.id })
    return inserted.length
  },

  async listDue(
    input: { campaignRowId: string; now: Date; limit: number },
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageRecipientModel[]> {
    return await tx
      .select()
      .from(recipient)
      .where(
        and(
          eq(recipient.campaignRowId, input.campaignRowId),
          eq(recipient.status, "pending"),
          or(
            isNull(recipient.nextAttemptAt),
            lte(recipient.nextAttemptAt, input.now),
          ),
        ),
      )
      .orderBy(asc(recipient.id))
      .limit(input.limit)
  },

  async update(
    input: { id: string } & RecipientPatch,
    tx: DatabaseClient = db,
  ): Promise<void> {
    const { id, ...patch } = input
    await tx.update(recipient).set(patch).where(eq(recipient.id, id))
  },

  /**
   * Post-send write that only lands while the row is still `unconfirmed`, so
   * a webhook result (delivered/failed) that raced ahead is never downgraded.
   */
  async settleSend(
    input: { id: string } & RecipientPatch,
    tx: DatabaseClient = db,
  ): Promise<void> {
    const { id, ...patch } = input
    await tx
      .update(recipient)
      .set(patch)
      .where(and(eq(recipient.id, id), eq(recipient.status, "unconfirmed")))
  },

  /**
   * Atomic claim before a Meta call: pending → unconfirmed (sentAt = now,
   * attempts + 1). Only a due row of a campaign that is still `sending` is
   * claimed, so Stop/Pause/Delete halt an in-flight batch at the next row.
   * Returns null when the row or the campaign is no longer claimable.
   */
  async claimForSend(
    input: { id: string; now: Date },
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageRecipientModel | null> {
    const [row] = await tx
      .update(recipient)
      .set({
        status: "unconfirmed",
        sentAt: input.now,
        attempts: sql`${recipient.attempts} + 1`,
      })
      .where(
        and(
          eq(recipient.id, input.id),
          eq(recipient.status, "pending"),
          or(
            isNull(recipient.nextAttemptAt),
            lte(recipient.nextAttemptAt, input.now),
          ),
          sql`exists (select 1 from ${campaign} where ${campaign.id} = ${recipient.campaignRowId} and ${campaign.status} = 'sending')`,
        ),
      )
      .returning()
    return row ?? null
  },

  /** `unconfirmed` rows whose send is older than `olderThan` become `failed`. */
  async failStaleUnconfirmed(
    input: { campaignRowId: string; olderThan: Date; now: Date },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const rows = await tx
      .update(recipient)
      .set({
        status: "failed",
        errorCode: null,
        errorMessage: "outcomeUnknown",
        errorSource: "send",
        failedAt: input.now,
      })
      .where(
        and(
          eq(recipient.campaignRowId, input.campaignRowId),
          eq(recipient.status, "unconfirmed"),
          lte(
            sql`coalesce(${recipient.sentAt}, ${recipient.updatedAt})`,
            input.olderThan,
          ),
        ),
      )
      .returning({ id: recipient.id })
    return rows.length
  },

  /**
   * Every row in `statuses` (default `pending` and `unconfirmed`) becomes
   * `failed`. Returns the count.
   */
  async failRemaining(
    input: {
      campaignRowId: string
      statuses?: FacebookMarketingMessageRecipientStatus[]
      errorCode: number | null
      errorMessage: string
      errorSource?: "send" | "webhook"
      now: Date
    },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const rows = await tx
      .update(recipient)
      .set({
        status: "failed",
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        errorSource: input.errorSource ?? null,
        failedAt: input.now,
      })
      .where(
        and(
          eq(recipient.campaignRowId, input.campaignRowId),
          inArray(
            recipient.status,
            input.statuses ?? ["pending", "unconfirmed"],
          ),
        ),
      )
      .returning({ id: recipient.id })
    return rows.length
  },

  async findByTrackingId(
    trackingId: string,
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageRecipientModel | null> {
    const [row] = await tx
      .select()
      .from(recipient)
      .where(eq(recipient.trackingId, trackingId))
      .limit(1)
    return row ?? null
  },

  async findByCampaignToken(
    input: { campaignRowId: string; subscriptionToken: string },
    tx: DatabaseClient = db,
  ): Promise<FacebookMarketingMessageRecipientModel | null> {
    const [row] = await tx
      .select()
      .from(recipient)
      .where(
        and(
          eq(recipient.campaignRowId, input.campaignRowId),
          eq(recipient.subscriptionToken, input.subscriptionToken),
        ),
      )
      .limit(1)
    return row ?? null
  },

  async countOutcomes(
    campaignRowId: string,
    tx: DatabaseClient = db,
  ): Promise<{
    pending: number
    unconfirmed: number
    sent: number
    delivered: number
    failed: number
  }> {
    const countStatus = (status: string) =>
      sql<number>`count(*) filter (where ${recipient.status} = ${status})::int`
    const [row] = await tx
      .select({
        pending: countStatus("pending"),
        unconfirmed: countStatus("unconfirmed"),
        sent: countStatus("sent"),
        delivered: countStatus("delivered"),
        failed: countStatus("failed"),
      })
      .from(recipient)
      .where(eq(recipient.campaignRowId, campaignRowId))
    return {
      pending: row?.pending ?? 0,
      unconfirmed: row?.unconfirmed ?? 0,
      sent: row?.sent ?? 0,
      delivered: row?.delivered ?? 0,
      failed: row?.failed ?? 0,
    }
  },

  /** Failed rows grouped by code when present, else by message. Top 50. */
  async errorBreakdown(
    campaignRowId: string,
    tx: DatabaseClient = db,
  ): Promise<
    { errorCode: number | null; errorMessage: string; count: number }[]
  > {
    const total = sql<number>`count(*)::int`
    const rows = await tx
      .select({
        errorCode: recipient.errorCode,
        errorMessage: sql<string>`coalesce(max(${recipient.errorMessage}), '')`,
        count: total,
      })
      .from(recipient)
      .where(
        and(
          eq(recipient.campaignRowId, campaignRowId),
          eq(recipient.status, "failed"),
        ),
      )
      .groupBy(
        recipient.errorCode,
        sql`case when ${recipient.errorCode} is null then ${recipient.errorMessage} end`,
      )
      .orderBy(desc(total))
      .limit(50)
    return rows
  },
}
