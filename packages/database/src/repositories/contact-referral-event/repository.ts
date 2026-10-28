import {
  type AnyColumn,
  and,
  asc,
  type DatabaseClient,
  db,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  lt,
  max,
  min,
  or,
  sql,
} from "../../client"
import {
  MAX_SIGNED_BIGINT,
  POSITIVE_BIGINT_PATTERN,
} from "../../partials/contact-activity"
import {
  adsConversionEventModel,
  type ContactReferralEventProvider,
  contactReferralEventModel,
} from "../../schema"
import type { ContactReferralEventModel } from "../../types"
import { likeContains } from "../../utils"

/**
 * How many of a workspace's newest ad touches the ad picker looks at. A fixed
 * index range scan, so the cost does not grow with the workspace; an ad that
 * has not been touched recently is not offered.
 */
export const RECENT_AD_TOUCH_SCAN_LIMIT = 2000

export type RecentAd = { adId: string; title: string | null }

/** One ad touch of a contact, as shown on its profile (no click ids). */
export type ContactAdTouch = Pick<
  ContactReferralEventModel,
  | "id"
  | "channel"
  | "provider"
  | "occurredAt"
  | "adId"
  | "campaignId"
  | "adGroupId"
  | "source"
  | "sourceUrl"
  | "metadata"
>

export type ContactAdTouchCursor = { occurredAt: Date; id: string }

type AdTouchStatsRow = {
  adId: string
  /** The ad's latest headline within the range. */
  title: string | null
  anyTouchContacts: number
  firstTouchContacts: number
}

type LinkedConversionRow = {
  adId: string
  eventType: "lead" | "purchase"
  currency: string | null
  count: number
  amount: string
}

export type AdStatsRange = {
  workspaceId: string
  since: Date
  until: Date
  channel?: string
}

export type ContactReferralEventCreateValues = Omit<
  typeof contactReferralEventModel.$inferInsert,
  "id"
>

/** Every ad touch of a workspace; `withAdId` drops touches without an ad id. */
const adTouchScope = (workspaceId: string, { withAdId = false } = {}) =>
  and(
    eq(contactReferralEventModel.workspaceId, workspaceId),
    eq(contactReferralEventModel.type, "ad"),
    withAdId ? isNotNull(contactReferralEventModel.adId) : undefined,
  )

/**
 * Ids the "Clicked ad" filter accepts: a positive bigint. Applied in SQL, before
 * the picker's LIMIT, so an unusable id never takes a slot from a usable one.
 */
const filterableAdId = (adId: AnyColumn) =>
  sql`(${adId} ~ ${POSITIVE_BIGINT_PATTERN.source} AND (length(${adId}) < ${MAX_SIGNED_BIGINT.toString().length} OR (length(${adId}) = ${MAX_SIGNED_BIGINT.toString().length} AND ${adId} <= ${MAX_SIGNED_BIGINT.toString()})))`

const pinnedTouchFilter = (input: {
  clickId?: string | null
  adId?: string | null
}) => {
  if (input.clickId) {
    return eq(contactReferralEventModel.clickId, input.clickId)
  }
  return input.adId ? eq(contactReferralEventModel.adId, input.adId) : undefined
}

export const contactReferralEventRepository = {
  /** `null` when the touch was already recorded (webhook retry, repeat lookup). */
  async insertIgnoreDuplicate(
    values: ContactReferralEventCreateValues,
    tx: DatabaseClient = db,
  ): Promise<ContactReferralEventModel | null> {
    const [row] = await tx
      .insert(contactReferralEventModel)
      .values(values)
      .onConflictDoNothing({
        target: [
          contactReferralEventModel.workspaceId,
          contactReferralEventModel.contactInboxId,
          contactReferralEventModel.dedupKey,
        ],
      })
      .returning()

    return row ?? null
  },

  /**
   * The newest ad touch of a contact inbox, pinned to one click id or, when the
   * touch has none (Messenger/Instagram), to one ad. `null` when none matches
   * (a contact whose ad predates the log, or an ad that is no longer the one
   * the conversion was credited to).
   */
  async findLatestAdTouchId(
    input: {
      workspaceId: string
      contactInboxId: string
      provider: ContactReferralEventProvider
      clickId?: string | null
      adId?: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<string | null> {
    const [row] = await tx
      .select({ id: contactReferralEventModel.id })
      .from(contactReferralEventModel)
      .where(
        and(
          adTouchScope(input.workspaceId),
          eq(contactReferralEventModel.contactInboxId, input.contactInboxId),
          eq(contactReferralEventModel.provider, input.provider),
          pinnedTouchFilter(input),
        ),
      )
      .orderBy(
        desc(contactReferralEventModel.occurredAt),
        desc(contactReferralEventModel.id),
      )
      .limit(1)

    return row?.id ?? null
  },

  /**
   * The ads a workspace's newest touches came from, most recently touched
   * first, with each ad's latest headline. `search` matches the ad id or the
   * headline; `adIds` narrows to those ads (label lookup).
   */
  async listRecentAds(
    input: {
      workspaceId: string
      limit: number
      search?: string
      adIds?: string[]
    },
    tx: DatabaseClient = db,
  ): Promise<RecentAd[]> {
    const recent = tx
      .select({
        adId: contactReferralEventModel.adId,
        title: sql<
          string | null
        >`${contactReferralEventModel.metadata}->>'adTitle'`.as("title"),
        occurredAt: contactReferralEventModel.occurredAt,
      })
      .from(contactReferralEventModel)
      .where(
        and(
          adTouchScope(input.workspaceId, { withAdId: true }),
          filterableAdId(contactReferralEventModel.adId),
        ),
      )
      .orderBy(desc(contactReferralEventModel.occurredAt))
      .limit(RECENT_AD_TOUCH_SCAN_LIMIT)
      .as("recent")

    const pattern = input.search ? likeContains(input.search) : undefined
    const rows = await tx
      .select({
        adId: recent.adId,
        title: sql<
          string | null
        >`(array_agg(${recent.title} ORDER BY ${recent.occurredAt} DESC) FILTER (WHERE ${recent.title} IS NOT NULL))[1]`,
      })
      .from(recent)
      .where(
        and(
          input.adIds ? inArray(recent.adId, input.adIds) : undefined,
          pattern
            ? or(ilike(recent.adId, pattern), ilike(recent.title, pattern))
            : undefined,
        ),
      )
      .groupBy(recent.adId)
      .orderBy(desc(max(recent.occurredAt)))
      .limit(input.limit)

    return rows.flatMap(({ adId, title }) => (adId ? [{ adId, title }] : []))
  },

  /**
   * A contact's ad touches, newest first, keyset-paginated. Fetches one row
   * past `limit` so the caller can tell whether another page exists.
   */
  async listAdTouchesByContact(
    input: {
      workspaceId: string
      contactId: string
      limit: number
      cursor?: ContactAdTouchCursor
    },
    tx: DatabaseClient = db,
  ): Promise<ContactAdTouch[]> {
    return await tx
      .select({
        id: contactReferralEventModel.id,
        channel: contactReferralEventModel.channel,
        provider: contactReferralEventModel.provider,
        occurredAt: contactReferralEventModel.occurredAt,
        adId: contactReferralEventModel.adId,
        campaignId: contactReferralEventModel.campaignId,
        adGroupId: contactReferralEventModel.adGroupId,
        source: contactReferralEventModel.source,
        sourceUrl: contactReferralEventModel.sourceUrl,
        metadata: contactReferralEventModel.metadata,
      })
      .from(contactReferralEventModel)
      .where(
        and(
          adTouchScope(input.workspaceId),
          eq(contactReferralEventModel.contactId, input.contactId),
          input.cursor
            ? or(
                lt(
                  contactReferralEventModel.occurredAt,
                  input.cursor.occurredAt,
                ),
                and(
                  eq(
                    contactReferralEventModel.occurredAt,
                    input.cursor.occurredAt,
                  ),
                  lt(contactReferralEventModel.id, input.cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(
        desc(contactReferralEventModel.occurredAt),
        desc(contactReferralEventModel.id),
      )
      .limit(input.limit + 1)
  },

  /**
   * Per ad over a time range: contacts that touched it, and contacts whose
   * FIRST touch in the range was it. Reads only the range, by the
   * (workspaceId, type, occurredAt) index; the caller bounds the range.
   */
  async aggregateAdTouchStats(
    input: AdStatsRange & { limit: number },
    tx: DatabaseClient = db,
  ): Promise<AdTouchStatsRow[]> {
    const channelFilter = input.channel
      ? sql`AND "channel" = ${input.channel}`
      : sql``
    const result = await tx.execute<AdTouchStatsRow>(sql`
      WITH touches AS (
        SELECT "contactId", "adId", "occurredAt", "id",
          "metadata"->>'adTitle' AS "title"
        FROM ${contactReferralEventModel}
        WHERE "workspaceId" = ${input.workspaceId}::bigint
          AND "type" = 'ad'
          AND "adId" IS NOT NULL
          AND "occurredAt" >= ${input.since.toISOString()}::timestamptz
          AND "occurredAt" <= ${input.until.toISOString()}::timestamptz
          ${channelFilter}
      ),
      firsts AS (
        SELECT DISTINCT ON ("contactId") "contactId", "adId"
        FROM touches
        ORDER BY "contactId", "occurredAt", "id"
      )
      SELECT any_touch."adId" AS "adId",
        any_touch."title" AS "title",
        any_touch."contacts" AS "anyTouchContacts",
        COALESCE(first_touch."contacts", 0) AS "firstTouchContacts"
      FROM (
        SELECT "adId", COUNT(DISTINCT "contactId")::int AS "contacts",
          (array_agg("title" ORDER BY "occurredAt" DESC)
            FILTER (WHERE "title" IS NOT NULL))[1] AS "title"
        FROM touches GROUP BY "adId"
      ) any_touch
      LEFT JOIN (
        SELECT "adId", COUNT(*)::int AS "contacts"
        FROM firsts GROUP BY "adId"
      ) first_touch ON first_touch."adId" = any_touch."adId"
      ORDER BY any_touch."contacts" DESC, any_touch."adId"
      LIMIT ${input.limit}
    `)

    return result.rows
  },

  /**
   * Meta conversions credited to the given ads' touches, by type and currency.
   * Google conversions are not counted: their rows carry no lead/purchase type.
   */
  async aggregateMetaLinkedConversions(
    input: AdStatsRange & { adIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<LinkedConversionRow[]> {
    if (input.adIds.length === 0) {
      return []
    }

    const channelFilter = input.channel
      ? sql`AND e."channel" = ${input.channel}`
      : sql``
    const result = await tx.execute<LinkedConversionRow>(sql`
      SELECT r."adId" AS "adId", e."eventType" AS "eventType",
        e."currency" AS "currency", COUNT(*)::int AS "count",
        COALESCE(SUM(e."value"), 0)::text AS "amount"
      FROM ${adsConversionEventModel} e
      JOIN ${contactReferralEventModel} r ON r."id" = e."referralEventId"
      WHERE e."workspaceId" = ${input.workspaceId}::bigint
        AND e."occurredAt" >= ${input.since.toISOString()}::timestamptz
        AND e."occurredAt" <= ${input.until.toISOString()}::timestamptz
        AND r."adId" = ANY(ARRAY[${sql.join(
          input.adIds.map((adId) => sql`${adId}`),
          sql`, `,
        )}]::text[])
        ${channelFilter}
      GROUP BY r."adId", e."eventType", e."currency"
    `)

    return result.rows
  },

  /**
   * The distinct ad ids a contact arrived through, oldest touch first. A touch
   * without an ad id (a Google click read from Zalo) has nothing to list.
   */
  async listAdIdsByContact(
    input: { workspaceId: string; contactId: string; limit: number },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    const rows = await tx
      .select({ adId: contactReferralEventModel.adId })
      .from(contactReferralEventModel)
      .where(
        and(
          adTouchScope(input.workspaceId, { withAdId: true }),
          eq(contactReferralEventModel.contactId, input.contactId),
        ),
      )
      .groupBy(contactReferralEventModel.adId)
      .orderBy(
        asc(min(contactReferralEventModel.occurredAt)),
        asc(contactReferralEventModel.adId),
      )
      .limit(input.limit)

    return rows.flatMap(({ adId }) => (adId ? [adId] : []))
  },
}
