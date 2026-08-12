import {
  and,
  asc,
  count,
  type DatabaseClient,
  db,
  eq,
  gt,
  gte,
  isNull,
  lte,
  sql,
} from "../../client"
import { buildCtwaSegmentPredicate } from "../../queries/contact-filter/ctwa-retarget"
import type { AdsConversionCapiStatus } from "../../schema"
import {
  adsConversionEventModel,
  contactInboxModel,
  contactModel,
  integrationWhatsappModel,
} from "../../schema"
import type { AdsConversionEventModel, ContactInboxModel } from "../../types"

export type AdsConversionEventCreateValues = Omit<
  typeof adsConversionEventModel.$inferInsert,
  "id"
>

export type AdsConversionEventAttribution = Pick<
  ContactInboxModel,
  "id" | "referral"
> & {
  wabaId: string
}

type FindWorkspaceEventInput = {
  id: string
  workspaceId: string
}

type UpdateCapiStatusInput = FindWorkspaceEventInput & {
  from: Extract<AdsConversionCapiStatus, "pending">
  to: Exclude<AdsConversionCapiStatus, "pending">
  capiSentAt?: Date
}

export type CtwaConversationCountByAd = {
  adId: string | null
  conversations: number
}

export type CtwaConversationCountByDayAndAd = {
  date: string
  adId: string | null
  conversations: number
}

export type AdsConversionEventCountByAd = {
  adId: string | null
  eventType: "lead" | "purchase"
  count: number
  purchaseValue: string | null
}

export type AdsConversionEventCountByDayAndAd = {
  date: string
  adId: string | null
  eventType: "lead" | "purchase"
  count: number
}

export type AdsConversionCapiStatusCount = {
  capiStatus: AdsConversionCapiStatus
  count: number
}

export type AdsConversionExportSegment = "conversations" | "leads" | "purchases"

export type AdsConversionExportRow = {
  contactId: string
  contactName: string | null
  phoneNumber: string | null
  email: string | null
  adId: string | null
  occurredAt: Date
}

type DateRangeInput = {
  workspaceId: string
  since: Date
  until: Date
  integrationWhatsappId?: string
}

type ExportSegmentInput = DateRangeInput & {
  segment: AdsConversionExportSegment
  adId?: string | null
  afterId?: string
  limit: number
}

export const adsConversionEventRepository = {
  async insertIgnoreDuplicate(
    values: AdsConversionEventCreateValues,
    tx: DatabaseClient = db,
  ): Promise<AdsConversionEventModel | null> {
    const [row] = await tx
      .insert(adsConversionEventModel)
      .values(values)
      .onConflictDoNothing({
        target: [
          adsConversionEventModel.workspaceId,
          adsConversionEventModel.integrationWhatsappId,
          adsConversionEventModel.source,
          adsConversionEventModel.sourceEventId,
        ],
      })
      .returning()

    return row ?? null
  },

  /**
   * Looks up an event by its deterministic `sourceEventId` (the same unique
   * key `insertIgnoreDuplicate` conflicts on). Used by the generic trigger
   * evaluator's find-or-create path: when the insert is deduped (the event
   * already exists from a previous evaluation), this recovers the row so its
   * `sendConversionEvent` job can still be (re-)enqueued idempotently — the
   * safety net for an enqueue that failed after a prior insert succeeded.
   */
  async findBySourceEventId(
    input: {
      workspaceId: string
      integrationWhatsappId: string
      source: AdsConversionEventCreateValues["source"]
      sourceEventId: string
    },
    tx: DatabaseClient = db,
  ): Promise<AdsConversionEventModel | null> {
    const [row] = await tx
      .select()
      .from(adsConversionEventModel)
      .where(
        and(
          eq(adsConversionEventModel.workspaceId, input.workspaceId),
          eq(
            adsConversionEventModel.integrationWhatsappId,
            input.integrationWhatsappId,
          ),
          eq(adsConversionEventModel.source, input.source),
          eq(adsConversionEventModel.sourceEventId, input.sourceEventId),
        ),
      )
      .limit(1)

    return row ?? null
  },

  async findAttributionByCtwaClid(
    input: {
      workspaceId: string
      integrationWhatsappId: string
      ctwaClid: string
    },
    tx: DatabaseClient = db,
  ): Promise<AdsConversionEventAttribution | null> {
    const [row] = await tx
      .select({
        id: contactInboxModel.id,
        referral: contactInboxModel.referral,
        wabaId: integrationWhatsappModel.wabaId,
      })
      .from(contactInboxModel)
      .innerJoin(
        integrationWhatsappModel,
        and(
          eq(contactInboxModel.inboxId, integrationWhatsappModel.inboxId),
          eq(integrationWhatsappModel.id, input.integrationWhatsappId),
          eq(integrationWhatsappModel.workspaceId, input.workspaceId),
        ),
      )
      .where(
        sql`${contactInboxModel.referral}->>'ctwaClid' = ${input.ctwaClid}`,
      )
      .limit(1)

    return row ?? null
  },

  async findAttributionByContactInbox(
    input: {
      workspaceId: string
      integrationWhatsappId: string
      contactInboxId: string
    },
    tx: DatabaseClient = db,
  ): Promise<AdsConversionEventAttribution | null> {
    const [row] = await tx
      .select({
        id: contactInboxModel.id,
        referral: contactInboxModel.referral,
        wabaId: integrationWhatsappModel.wabaId,
      })
      .from(contactInboxModel)
      .innerJoin(
        integrationWhatsappModel,
        and(
          eq(contactInboxModel.inboxId, integrationWhatsappModel.inboxId),
          eq(integrationWhatsappModel.id, input.integrationWhatsappId),
          eq(integrationWhatsappModel.workspaceId, input.workspaceId),
        ),
      )
      .where(
        and(
          eq(contactInboxModel.id, input.contactInboxId),
          sql`${contactInboxModel.referral}->>'ctwaClid' IS NOT NULL`,
        ),
      )
      .limit(1)

    return row ?? null
  },

  listPendingCapi(
    workspaceId?: string,
    tx: DatabaseClient = db,
  ): Promise<AdsConversionEventModel[]> {
    const filters = [
      eq(adsConversionEventModel.capiStatus, "pending"),
      isNull(adsConversionEventModel.capiSentAt),
      workspaceId
        ? eq(adsConversionEventModel.workspaceId, workspaceId)
        : undefined,
    ].filter((filter) => filter !== undefined)

    return tx
      .select()
      .from(adsConversionEventModel)
      .where(and(...filters))
      .orderBy(asc(adsConversionEventModel.occurredAt))
  },

  async findWorkspaceEvent(
    input: FindWorkspaceEventInput,
    tx: DatabaseClient = db,
  ): Promise<AdsConversionEventModel | null> {
    const [row] = await tx
      .select()
      .from(adsConversionEventModel)
      .where(
        and(
          eq(adsConversionEventModel.id, input.id),
          eq(adsConversionEventModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)

    return row ?? null
  },

  async updateCapiStatus(
    input: UpdateCapiStatusInput,
    tx: DatabaseClient = db,
  ): Promise<AdsConversionEventModel | null> {
    const [row] = await tx
      .update(adsConversionEventModel)
      .set({
        capiStatus: input.to,
        capiSentAt: input.capiSentAt,
      })
      .where(
        and(
          eq(adsConversionEventModel.id, input.id),
          eq(adsConversionEventModel.workspaceId, input.workspaceId),
          eq(adsConversionEventModel.capiStatus, input.from),
        ),
      )
      .returning()

    return row ?? null
  },

  async countCtwaConversationsByAd(
    input: DateRangeInput,
    tx: DatabaseClient = db,
  ): Promise<CtwaConversationCountByAd[]> {
    const filters = and(
      eq(contactModel.workspaceId, input.workspaceId),
      sql`${contactInboxModel.referral}->>'ctwaClid' IS NOT NULL`,
      gte(contactInboxModel.firstInteractionAt, input.since),
      lte(contactInboxModel.firstInteractionAt, input.until),
    )
    const adIdExpression = sql<
      string | null
    >`${contactInboxModel.referral}->>'adId'`
    const rows = input.integrationWhatsappId
      ? await tx
          .select({
            adId: adIdExpression,
            conversations: count(contactInboxModel.id),
          })
          .from(contactInboxModel)
          .innerJoin(
            integrationWhatsappModel,
            and(
              eq(contactInboxModel.inboxId, integrationWhatsappModel.inboxId),
              eq(integrationWhatsappModel.id, input.integrationWhatsappId),
              eq(integrationWhatsappModel.workspaceId, input.workspaceId),
            ),
          )
          .innerJoin(
            contactModel,
            eq(contactModel.id, contactInboxModel.contactId),
          )
          .where(filters)
          .groupBy(adIdExpression)
      : await tx
          .select({
            adId: adIdExpression,
            conversations: count(contactInboxModel.id),
          })
          .from(contactInboxModel)
          .innerJoin(
            contactModel,
            eq(contactModel.id, contactInboxModel.contactId),
          )
          .where(filters)
          .groupBy(adIdExpression)

    return rows.map((row) => ({
      adId: row.adId,
      conversations: Number(row.conversations),
    }))
  },

  async countCtwaConversationsByDayAndAd(
    input: DateRangeInput,
    tx: DatabaseClient = db,
  ): Promise<CtwaConversationCountByDayAndAd[]> {
    const filters = and(
      eq(contactModel.workspaceId, input.workspaceId),
      sql`${contactInboxModel.referral}->>'ctwaClid' IS NOT NULL`,
      gte(contactInboxModel.firstInteractionAt, input.since),
      lte(contactInboxModel.firstInteractionAt, input.until),
    )
    const adIdExpression = sql<
      string | null
    >`${contactInboxModel.referral}->>'adId'`
    // Explicit UTC date bucketing — `DATE(col)`/`col::date` depend on the
    // session timezone, so the day boundary must be pinned via AT TIME ZONE.
    const dateExpression = sql<string>`to_char(${contactInboxModel.firstInteractionAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`
    const rows = input.integrationWhatsappId
      ? await tx
          .select({
            date: dateExpression,
            adId: adIdExpression,
            conversations: count(contactInboxModel.id),
          })
          .from(contactInboxModel)
          .innerJoin(
            integrationWhatsappModel,
            and(
              eq(contactInboxModel.inboxId, integrationWhatsappModel.inboxId),
              eq(integrationWhatsappModel.id, input.integrationWhatsappId),
              eq(integrationWhatsappModel.workspaceId, input.workspaceId),
            ),
          )
          .innerJoin(
            contactModel,
            eq(contactModel.id, contactInboxModel.contactId),
          )
          .where(filters)
          .groupBy(dateExpression, adIdExpression)
      : await tx
          .select({
            date: dateExpression,
            adId: adIdExpression,
            conversations: count(contactInboxModel.id),
          })
          .from(contactInboxModel)
          .innerJoin(
            contactModel,
            eq(contactModel.id, contactInboxModel.contactId),
          )
          .where(filters)
          .groupBy(dateExpression, adIdExpression)

    return rows.map((row) => ({
      date: row.date,
      adId: row.adId,
      conversations: Number(row.conversations),
    }))
  },

  async countConversionEventsByAd(
    input: DateRangeInput,
    tx: DatabaseClient = db,
  ): Promise<AdsConversionEventCountByAd[]> {
    const rows = await tx
      .select({
        adId: adsConversionEventModel.adId,
        eventType: adsConversionEventModel.eventType,
        count: count(adsConversionEventModel.id),
        purchaseValue: sql<string | null>`
          SUM(
            CASE
              WHEN ${adsConversionEventModel.eventType} = 'purchase'
              THEN ${adsConversionEventModel.value}
              ELSE NULL
            END
          )
        `,
      })
      .from(adsConversionEventModel)
      .where(
        and(
          eq(adsConversionEventModel.workspaceId, input.workspaceId),
          gte(adsConversionEventModel.occurredAt, input.since),
          lte(adsConversionEventModel.occurredAt, input.until),
          input.integrationWhatsappId
            ? eq(
                adsConversionEventModel.integrationWhatsappId,
                input.integrationWhatsappId,
              )
            : undefined,
        ),
      )
      .groupBy(adsConversionEventModel.adId, adsConversionEventModel.eventType)

    return rows.map((row) => ({
      adId: row.adId,
      eventType: row.eventType,
      count: Number(row.count),
      purchaseValue: row.purchaseValue,
    }))
  },

  async countConversionEventsByDayAndAd(
    input: DateRangeInput,
    tx: DatabaseClient = db,
  ): Promise<AdsConversionEventCountByDayAndAd[]> {
    // Explicit UTC date bucketing — see countCtwaConversationsByDayAndAd.
    const dateExpression = sql<string>`to_char(${adsConversionEventModel.occurredAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`
    const rows = await tx
      .select({
        date: dateExpression,
        adId: adsConversionEventModel.adId,
        eventType: adsConversionEventModel.eventType,
        count: count(adsConversionEventModel.id),
      })
      .from(adsConversionEventModel)
      .where(
        and(
          eq(adsConversionEventModel.workspaceId, input.workspaceId),
          gte(adsConversionEventModel.occurredAt, input.since),
          lte(adsConversionEventModel.occurredAt, input.until),
          input.integrationWhatsappId
            ? eq(
                adsConversionEventModel.integrationWhatsappId,
                input.integrationWhatsappId,
              )
            : undefined,
        ),
      )
      .groupBy(
        dateExpression,
        adsConversionEventModel.adId,
        adsConversionEventModel.eventType,
      )

    return rows.map((row) => ({
      date: row.date,
      adId: row.adId,
      eventType: row.eventType,
      count: Number(row.count),
    }))
  },

  async countByCapiStatus(
    input: DateRangeInput,
    tx: DatabaseClient = db,
  ): Promise<AdsConversionCapiStatusCount[]> {
    const rows = await tx
      .select({
        capiStatus: adsConversionEventModel.capiStatus,
        count: count(adsConversionEventModel.id),
      })
      .from(adsConversionEventModel)
      .where(
        and(
          eq(adsConversionEventModel.workspaceId, input.workspaceId),
          gte(adsConversionEventModel.occurredAt, input.since),
          lte(adsConversionEventModel.occurredAt, input.until),
          input.integrationWhatsappId
            ? eq(
                adsConversionEventModel.integrationWhatsappId,
                input.integrationWhatsappId,
              )
            : undefined,
        ),
      )
      .groupBy(adsConversionEventModel.capiStatus)

    return rows.map((row) => ({
      capiStatus: row.capiStatus,
      count: Number(row.count),
    }))
  },

  async listExportSegmentRows(
    input: ExportSegmentInput,
    tx: DatabaseClient = db,
  ): Promise<Array<AdsConversionExportRow & { id: string }>> {
    if (input.segment === "conversations") {
      const filters = and(
        // Contact is in this query's FROM, so scope by workspace here — the
        // shared predicate omits `Contact.workspaceId` (see ctwa-retarget.ts).
        eq(contactModel.workspaceId, input.workspaceId),
        buildCtwaSegmentPredicate({
          segment: "conversations",
          adId: input.adId,
          since: input.since,
          until: input.until,
          workspaceId: input.workspaceId,
          integrationWhatsappId: input.integrationWhatsappId,
        }),
        input.afterId ? gt(contactInboxModel.id, input.afterId) : undefined,
      )
      const selection = {
        id: contactInboxModel.id,
        contactId: contactModel.id,
        contactName: contactModel.fullName,
        phoneNumber: contactModel.phoneNumber,
        email: contactModel.email,
        adId: sql<string | null>`${contactInboxModel.referral}->>'adId'`,
        occurredAt: contactInboxModel.firstInteractionAt,
      }
      // Integration scope now lives in `buildCtwaSegmentPredicate` (a correlated
      // EXISTS), so the query no longer branches on `integrationWhatsappId`.
      const rows = await tx
        .select(selection)
        .from(contactInboxModel)
        .innerJoin(
          contactModel,
          eq(contactModel.id, contactInboxModel.contactId),
        )
        .where(filters)
        .orderBy(asc(contactInboxModel.id))
        .limit(input.limit)

      return rows.flatMap((row) =>
        row.occurredAt
          ? [
              {
                ...row,
                occurredAt: row.occurredAt,
              },
            ]
          : [],
      )
    }

    return tx
      .select({
        id: adsConversionEventModel.id,
        contactId: contactModel.id,
        contactName: contactModel.fullName,
        phoneNumber: contactModel.phoneNumber,
        email: contactModel.email,
        adId: adsConversionEventModel.adId,
        occurredAt: adsConversionEventModel.occurredAt,
      })
      .from(adsConversionEventModel)
      .innerJoin(
        contactInboxModel,
        eq(contactInboxModel.id, adsConversionEventModel.contactInboxId),
      )
      .innerJoin(contactModel, eq(contactModel.id, contactInboxModel.contactId))
      .where(
        and(
          buildCtwaSegmentPredicate({
            segment: input.segment,
            adId: input.adId,
            since: input.since,
            until: input.until,
            workspaceId: input.workspaceId,
            integrationWhatsappId: input.integrationWhatsappId,
          }),
          input.afterId
            ? gt(adsConversionEventModel.id, input.afterId)
            : undefined,
        ),
      )
      .orderBy(asc(adsConversionEventModel.id))
      .limit(input.limit)
  },
}
