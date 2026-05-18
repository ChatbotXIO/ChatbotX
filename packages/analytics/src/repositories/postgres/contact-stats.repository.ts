import { db, sql } from "@chatbotx.io/database/client"
import { analyticsContactEventModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import {
  fillContactStatsMonthlySeries,
  fillDailyContactStats,
  fillDailyNewContactsSeries,
  fillDailyTotalContactsSeries,
  fillMonthlyNewContactsSeries,
  fillTotalContactsMonthlySeries,
  shouldUseMonthlyGranularity,
} from "../../lib/time-series"
import type {
  ContactCountsSchema,
  ContactEventType,
  ContactStats,
  ContactsByDimension,
  TimeRangeQuery,
} from "../../schemas"
import { BaseRepository } from "./base.repository"

export type InsertContactEventRow = {
  workspaceId: string
  contactId: string
  occurredAt: Date | string | number
  source?: string | null
  sourceId?: string | null
  channel?: string | null
  country?: string | null
  metadata?: Record<string, unknown> | null
}

export class ContactStatsRepository extends BaseRepository {
  async insertEvents(
    payloads: InsertContactEventRow[],
    eventType: ContactEventType,
  ): Promise<void> {
    if (payloads.length === 0) {
      return
    }
    const rows = payloads.map((p) => ({
      eventId: createId(),
      workspaceId: p.workspaceId,
      contactId: p.contactId,
      eventType,
      occurredAt:
        p.occurredAt instanceof Date
          ? p.occurredAt
          : new Date(p.occurredAt as string),
      source: p.source ?? null,
      sourceId: p.sourceId ?? null,
      channel: p.channel ?? null,
      country: p.country ?? null,
      metadata: p.metadata ?? null,
    }))
    await db
      .insert(analyticsContactEventModel)
      .values(rows)
      .onConflictDoNothing()
  }

  async getStatsByMinute(
    props: TimeRangeQuery & {
      eventTypes?: ContactEventType[]
    },
  ): Promise<ContactStats[]> {
    const { workspaceId, from, to, eventTypes } = props

    const eventTypeFilter =
      eventTypes && eventTypes.length > 0
        ? sql` AND "eventType" IN (${sql.join(
            eventTypes.map((t) => sql`${t}`),
            sql`, `,
          )})`
        : sql``

    const result = await db.execute(sql`
      SELECT
        time_bucket('1 minute', "occurredAt") AS bucket,
        "eventType",
        COUNT(*)::int AS count,
        COUNT(DISTINCT "contactId")::int AS "uniqueContacts"
      FROM "AnalyticsContactEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        ${eventTypeFilter}
      GROUP BY 1, 2
      ORDER BY 1 ASC, 2 ASC
    `)

    return (
      result.rows as {
        bucket: Date
        eventType: ContactEventType
        count: number
        uniqueContacts: number
      }[]
    ).map((row) => ({
      workspaceId,
      timestamp: row.bucket,
      eventType: row.eventType,
      count: Number(row.count),
      uniqueContacts: Number(row.uniqueContacts),
    }))
  }

  async getStatsByHour(
    props: TimeRangeQuery & {
      eventTypes?: ContactEventType[]
    },
  ): Promise<ContactStats[]> {
    const { workspaceId, from, to, eventTypes } = props

    const eventTypeFilter =
      eventTypes && eventTypes.length > 0
        ? sql` AND "eventType" IN (${sql.join(
            eventTypes.map((t) => sql`${t}`),
            sql`, `,
          )})`
        : sql``

    const result = await db.execute(sql`
      SELECT
        time_bucket('1 hour', bucket) AS bucket,
        "eventType",
        SUM(count)::int AS count
      FROM analytics_contact_events_hourly
      WHERE "workspaceId" = ${workspaceId}
        AND bucket >= ${from}
        AND bucket <= ${to}
        ${eventTypeFilter}
      GROUP BY 1, 2
      ORDER BY 1 ASC, 2 ASC
    `)

    return (
      result.rows as {
        bucket: Date
        eventType: ContactEventType
        count: number
      }[]
    ).map((row) => ({
      workspaceId,
      timestamp: row.bucket,
      eventType: row.eventType,
      count: Number(row.count),
      uniqueContacts: 0,
    }))
  }

  async getStatsByDay(
    props: TimeRangeQuery & {
      eventTypes?: ContactEventType[]
    },
  ): Promise<ContactStats[]> {
    const { workspaceId, from, to, timezone, eventTypes } = props

    if (shouldUseMonthlyGranularity(props)) {
      return this.getStatsByMonth({ ...props, eventTypes })
    }

    const eventTypeFilter =
      eventTypes && eventTypes.length > 0
        ? sql` AND "eventType" IN (${sql.join(
            eventTypes.map((t) => sql`${t}`),
            sql`, `,
          )})`
        : sql``

    const result = await db.execute(sql`
      SELECT
        time_bucket('1 day', bucket AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS bucket,
        "eventType",
        SUM(count)::int AS count
      FROM analytics_contact_events_hourly
      WHERE "workspaceId" = ${workspaceId}
        AND bucket >= ${from}
        AND bucket <= ${to}
        ${eventTypeFilter}
      GROUP BY 1, 2
      ORDER BY 1 ASC, 2 ASC
    `)

    const rows = (
      result.rows as {
        bucket: Date
        eventType: ContactEventType
        count: number
      }[]
    ).map((row) => ({
      workspaceId,
      timestamp: row.bucket,
      eventType: row.eventType,
      count: Number(row.count),
      uniqueContacts: 0,
    }))

    if (!eventTypes || eventTypes.length === 0) {
      return rows
    }
    return fillDailyContactStats({ ...props, rows, eventTypes })
  }

  private async getStatsByMonth(
    props: TimeRangeQuery & {
      eventTypes?: ContactEventType[]
    },
  ): Promise<ContactStats[]> {
    const { workspaceId, from, to, timezone, eventTypes } = props

    const eventTypeFilter =
      eventTypes && eventTypes.length > 0
        ? sql` AND "eventType" IN (${sql.join(
            eventTypes.map((t) => sql`${t}`),
            sql`, `,
          )})`
        : sql``

    const result = await db.execute(sql`
      SELECT
        time_bucket('1 month', bucket AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS bucket,
        "eventType",
        SUM(count)::int AS count
      FROM analytics_contact_events_hourly
      WHERE "workspaceId" = ${workspaceId}
        AND bucket >= ${from}
        AND bucket <= ${to}
        ${eventTypeFilter}
      GROUP BY 1, 2
      ORDER BY 1 ASC, 2 ASC
    `)

    const rows = (
      result.rows as {
        bucket: Date
        eventType: ContactEventType
        count: number
      }[]
    ).map((row) => ({
      workspaceId,
      timestamp: row.bucket,
      eventType: row.eventType,
      count: Number(row.count),
      uniqueContacts: 0,
    }))

    if (!eventTypes || eventTypes.length === 0) {
      return rows
    }
    return fillContactStatsMonthlySeries({ ...props, rows, eventTypes })
  }

  async getContactCountsPerDay(
    props: TimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    if (shouldUseMonthlyGranularity(props)) {
      return this.getContactCountsPerMonth(props)
    }

    const { workspaceId, from, to, timezone } = props

    const dayStart = sql`date_trunc('day', ${from}::timestamptz AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone}`

    // Baseline must query the raw hypertable, not the
    // `analytics_contact_events_hourly` continuous aggregate. The cagg refresh
    // policy materializes only the last 7 days; events older than that are
    // below the invalidation watermark and never appear in the cagg, so a
    // cagg-based baseline returns 0 for any workspace whose first contact
    // pre-dates the cagg window.
    const [baselineResult, seriesResult] = await Promise.all([
      db.execute(sql`
        SELECT COALESCE(
          COUNT(*) FILTER (WHERE "eventType" = 'contact_created') -
          COUNT(*) FILTER (WHERE "eventType" = 'contact_deleted'),
          0
        )::int AS baseline
        FROM "AnalyticsContactEvent"
        WHERE "workspaceId" = ${workspaceId}
          AND "occurredAt" < ${dayStart}
          AND "eventType" IN ('contact_created', 'contact_deleted')
      `),
      db.execute(sql`
        SELECT
          time_bucket('1 day', bucket AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS day,
          SUM(CASE WHEN "eventType" = 'contact_created' THEN count ELSE 0 END)::int -
          SUM(CASE WHEN "eventType" = 'contact_deleted' THEN count ELSE 0 END)::int AS net
        FROM analytics_contact_events_hourly
        WHERE "workspaceId" = ${workspaceId}
          AND bucket >= ${dayStart}
          AND bucket <= ${to}
          AND "eventType" IN ('contact_created', 'contact_deleted')
        GROUP BY 1
        ORDER BY 1 ASC
      `),
    ])

    const baseline = Number(
      (baselineResult.rows[0] as { baseline: number } | undefined)?.baseline ??
        0,
    )

    const raw: ContactCountsSchema[] = (
      seriesResult.rows as { day: Date; net: number }[]
    ).map((row) => ({ date: row.day, count: Number(row.net) }))

    let running = baseline
    const withBaseline = raw.map((r) => {
      running += r.count
      return { date: r.date, count: running }
    })

    return fillDailyTotalContactsSeries({
      ...props,
      raw: withBaseline,
      initialTotal: baseline,
    })
  }

  private async getContactCountsPerMonth(
    props: TimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    const { workspaceId, from, to, timezone } = props

    const monthStart = sql`date_trunc('month', ${from}::timestamptz AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone}`

    // Baseline uses the raw hypertable (not the cagg) for the same reason as
    // the daily path: the cagg refresh policy only materializes the last 7
    // days, so older data is absent from analytics_contact_events_hourly.
    const [baselineResult, seriesResult] = await Promise.all([
      db.execute(sql`
        SELECT COALESCE(
          COUNT(*) FILTER (WHERE "eventType" = 'contact_created') -
          COUNT(*) FILTER (WHERE "eventType" = 'contact_deleted'),
          0
        )::int AS baseline
        FROM "AnalyticsContactEvent"
        WHERE "workspaceId" = ${workspaceId}
          AND "occurredAt" < ${monthStart}
          AND "eventType" IN ('contact_created', 'contact_deleted')
      `),
      db.execute(sql`
        SELECT
          time_bucket('1 month', bucket AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS month,
          SUM(CASE WHEN "eventType" = 'contact_created' THEN count ELSE 0 END)::int -
          SUM(CASE WHEN "eventType" = 'contact_deleted' THEN count ELSE 0 END)::int AS net
        FROM analytics_contact_events_hourly
        WHERE "workspaceId" = ${workspaceId}
          AND bucket >= ${monthStart}
          AND bucket <= ${to}
          AND "eventType" IN ('contact_created', 'contact_deleted')
        GROUP BY 1
        ORDER BY 1 ASC
      `),
    ])

    const baseline = Number(
      (baselineResult.rows[0] as { baseline: number } | undefined)?.baseline ??
        0,
    )

    const raw: ContactCountsSchema[] = (
      seriesResult.rows as { month: Date; net: number }[]
    ).map((row) => ({ date: row.month, count: Number(row.net) }))

    let running = baseline
    const withBaseline = raw.map((r) => {
      running += r.count
      return { date: r.date, count: running }
    })

    return fillTotalContactsMonthlySeries({
      ...props,
      raw: withBaseline,
      initialTotal: baseline,
    })
  }

  async getNewContactsPerDay(
    props: TimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    if (shouldUseMonthlyGranularity(props)) {
      return this.getNewContactsPerMonth(props)
    }

    const { workspaceId, from, to, timezone } = props

    // Use raw table with COUNT(DISTINCT contactId) so duplicate
    // `contact_created` events for the same contact within a day collapse to
    // 1. Matches the legacy ClickHouse `uniqMerge` semantic and keeps the sum
    // of daily values consistent with `getNewContactsCount`.
    const result = await db.execute(sql`
      SELECT
        time_bucket('1 day', "occurredAt" AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS day,
        COUNT(DISTINCT "contactId")::int AS new_contacts
      FROM "AnalyticsContactEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND "eventType" = 'contact_created'
      GROUP BY 1
      ORDER BY 1 ASC
    `)

    const raw = (result.rows as { day: Date; new_contacts: number }[]).map(
      (row) => ({
        date: row.day,
        count: Number(row.new_contacts),
      }),
    )

    return fillDailyNewContactsSeries({ ...props, raw })
  }

  private async getNewContactsPerMonth(
    props: TimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    const { workspaceId, from, to, timezone } = props

    const result = await db.execute(sql`
      SELECT
        time_bucket('1 month', "occurredAt" AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS month,
        COUNT(DISTINCT "contactId")::int AS new_contacts
      FROM "AnalyticsContactEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND "eventType" = 'contact_created'
      GROUP BY 1
      ORDER BY 1 ASC
    `)

    const raw = (result.rows as { month: Date; new_contacts: number }[]).map(
      (row) => ({
        date: row.month,
        count: Number(row.new_contacts),
      }),
    )

    return fillMonthlyNewContactsSeries({ ...props, raw })
  }

  async getNewContactsCount(props: TimeRangeQuery): Promise<number> {
    const { workspaceId, from, to } = props

    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT "contactId")::int AS count
      FROM "AnalyticsContactEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND "eventType" = 'contact_created'
    `)

    return Number((result.rows[0] as { count: number } | undefined)?.count ?? 0)
  }

  async getBlockedContactsPerDay(
    props: TimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    if (shouldUseMonthlyGranularity(props)) {
      return this.getBlockedContactsPerMonth(props)
    }

    const { workspaceId, from, to, timezone } = props

    // COUNT(DISTINCT contactId) — same contact blocked twice in a day (manual
    // path + auto-detect via message:failed) collapses to 1.
    const result = await db.execute(sql`
      SELECT
        time_bucket('1 day', "occurredAt" AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS day,
        COUNT(DISTINCT "contactId")::int AS blocked_contacts
      FROM "AnalyticsContactEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND "eventType" = 'contact_blocked'
      GROUP BY 1
      ORDER BY 1 ASC
    `)

    const raw = (result.rows as { day: Date; blocked_contacts: number }[]).map(
      (row) => ({
        date: row.day,
        count: Number(row.blocked_contacts),
      }),
    )

    return fillDailyNewContactsSeries({ ...props, raw })
  }

  private async getBlockedContactsPerMonth(
    props: TimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    const { workspaceId, from, to, timezone } = props

    const result = await db.execute(sql`
      SELECT
        time_bucket('1 month', "occurredAt" AT TIME ZONE ${timezone} AT TIME ZONE 'UTC') AS month,
        COUNT(DISTINCT "contactId")::int AS blocked_contacts
      FROM "AnalyticsContactEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND "eventType" = 'contact_blocked'
      GROUP BY 1
      ORDER BY 1 ASC
    `)

    const raw = (
      result.rows as { month: Date; blocked_contacts: number }[]
    ).map((row) => ({
      date: row.month,
      count: Number(row.blocked_contacts),
    }))

    return fillMonthlyNewContactsSeries({ ...props, raw })
  }

  async getBlockedContactsCount(props: TimeRangeQuery): Promise<number> {
    const { workspaceId, from, to } = props

    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT "contactId")::int AS count
      FROM "AnalyticsContactEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND "eventType" = 'contact_blocked'
    `)

    return Number((result.rows[0] as { count: number } | undefined)?.count ?? 0)
  }

  async getContactsCount(props: TimeRangeQuery): Promise<number> {
    const { workspaceId } = props

    const result = await db.execute(sql`
      SELECT COALESCE(SUM(ics."totalContacts"), 0)::int AS total
      FROM "InboxContactStat" ics
      INNER JOIN "Inbox" i ON i.id = ics."inboxId"
      WHERE i."workspaceId" = ${workspaceId}
    `)

    return Number((result.rows[0] as { total: number } | undefined)?.total ?? 0)
  }

  getContactsByCountry(props: TimeRangeQuery): Promise<ContactsByDimension[]> {
    return this.getContactsByDimension(props, "country")
  }

  getContactsByChannel(props: TimeRangeQuery): Promise<ContactsByDimension[]> {
    return this.getContactsByDimension(props, "channel")
  }

  private async getContactsByDimension(
    props: TimeRangeQuery,
    dimension: "country" | "channel",
  ): Promise<ContactsByDimension[]> {
    const { workspaceId, from, to } = props
    const col = dimension === "country" ? sql`"country"` : sql`"channel"`

    const result = await db.execute(sql`
      SELECT
        ${col} AS dimension,
        COUNT(*)::int AS count,
        COUNT(DISTINCT "contactId")::int AS "uniqueContacts"
      FROM "AnalyticsContactEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND "eventType" = 'contact_created'
        AND ${col} IS NOT NULL
        AND ${col} != ''
      GROUP BY 1
      ORDER BY count DESC
    `)

    return (
      result.rows as {
        dimension: string
        count: number
        uniqueContacts: number
      }[]
    ).map((row) => ({
      dimension: row.dimension,
      count: Number(row.count),
      uniqueContacts: Number(row.uniqueContacts),
    }))
  }

  async getActiveContactsCount(props: TimeRangeQuery): Promise<number> {
    const { workspaceId, from, to } = props

    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT "contactId")::int AS count
      FROM "AnalyticsContactEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND "eventType" = 'contact_created'
    `)

    return Number((result.rows[0] as { count: number } | undefined)?.count ?? 0)
  }

  async getContactsBySource(
    props: TimeRangeQuery,
  ): Promise<ContactsByDimension[]> {
    const { workspaceId, from, to } = props

    const result = await db.execute(sql`
      SELECT
        "source" AS dimension,
        COUNT(*)::int AS count,
        COUNT(DISTINCT "contactId")::int AS "uniqueContacts"
      FROM "AnalyticsContactEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND "eventType" = 'contact_created'
        AND "source" IS NOT NULL
        AND "source" != ''
      GROUP BY 1
      ORDER BY count DESC
    `)

    return (
      result.rows as {
        dimension: string
        count: number
        uniqueContacts: number
      }[]
    ).map((row) => ({
      dimension: row.dimension,
      count: Number(row.count),
      uniqueContacts: Number(row.uniqueContacts),
    }))
  }
}

export const contactStatsRepository = new ContactStatsRepository()
