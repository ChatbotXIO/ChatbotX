import { db, sql } from "@chatbotx.io/database/client"
// Narrow subpath, NOT the `queries` barrel: that barrel re-exports the
// contact-filter modules, which dereference schema tables at module scope
// and therefore crash any suite that mocks `@chatbotx.io/database/schema`
// narrowly. Analytics only needs the one timezone helper.
import { resolvedTimezone } from "@chatbotx.io/database/queries/date-bucket"
import { analyticsContactEventModel } from "@chatbotx.io/database/schema"
import type { EventBusMessageMetadata } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { buildEventFilter } from "../../lib/event-filter"
import {
  fillContactStatsMonthlySeries,
  fillDailyContactStats,
  fillDailyNewContactsSeries,
  fillDailyTotalContactsSeries,
  fillMonthlyNewContactsSeries,
  fillTotalContactsMonthlySeries,
  shouldUseCagg,
  shouldUseMonthlyGranularity,
} from "../../lib/time-series"
import type {
  ContactCountsSchema,
  ContactDimension,
  ContactDimensionMetric,
  ContactEventType,
  ContactStats,
  ContactsByDimension,
  ContactsByDimensionQuery,
  FilteredTimeRangeQuery,
} from "../../schemas"
import {
  hasAnalyticsFilter,
  normalizeAnalyticsFilters,
} from "../../schemas/common"
import { BaseRepository } from "./base.repository"
import { getEventBusEventId } from "./event-bus-idempotency"

export type InsertContactEventRow = EventBusMessageMetadata & {
  workspaceId: string
  contactId: string
  occurredAt: Date | string | number
  source?: string | null
  sourceId?: string | null
  channel?: string | null
  inboxId?: string | null
  language?: string | null
  country?: string | null
  metadata?: Record<string, unknown> | null
}

type SqlFragment = ReturnType<typeof sql>
type SqlColumn = ReturnType<typeof sql.identifier>

// Column names are static map entries (never request input). SQL is built when
// a query runs, not at import time, so modules that mock the database client
// without `sql` can still import this repository.
const CONTACT_DIMENSION_COLUMNS: Record<ContactDimension, string> = {
  country: "country",
  channel: "channel",
  source: "source",
  language: "language",
}

// Contacts that exist as of `to`: same created-minus-deleted balance as the
// total contacts series. Reads the raw hypertable because the hourly cagg only
// materializes the last 7 days. Null/empty values collapse into one unknown
// group so the groups still add up to the series total.
const totalContactsBalance = (): SqlFragment => sql`(
  COUNT(*) FILTER (WHERE "eventType" = 'contact_created') -
  COUNT(*) FILTER (WHERE "eventType" = 'contact_deleted')
)::int`

const CONTACT_DIMENSION_QUERIES: Record<
  ContactDimensionMetric,
  (props: FilteredTimeRangeQuery, column: SqlColumn) => SqlFragment
> = {
  new: ({ workspaceId, from, to, ...filter }, column) => sql`
    SELECT
      ${column} AS dimension,
      COUNT(*)::int AS count,
      COUNT(DISTINCT "contactId")::int AS "uniqueContacts"
    FROM "AnalyticsContactEvent"
    WHERE "workspaceId" = ${workspaceId}${buildEventFilter(filter)}
      AND "occurredAt" >= ${from}
      AND "occurredAt" <= ${to}
      AND "eventType" = 'contact_created'
      AND ${column} IS NOT NULL
      AND ${column} != ''
    GROUP BY 1
    ORDER BY count DESC
  `,
  // A donut cannot draw a zero or negative slice, so those groups are dropped.
  total: ({ workspaceId, to, ...filter }, column) => sql`
    SELECT
      COALESCE(NULLIF(${column}, ''), '') AS dimension,
      ${totalContactsBalance()} AS count,
      ${totalContactsBalance()} AS "uniqueContacts"
    FROM "AnalyticsContactEvent"
    WHERE "workspaceId" = ${workspaceId}${buildEventFilter(filter)}
      AND "occurredAt" <= ${to}
      AND "eventType" IN ('contact_created', 'contact_deleted')
    GROUP BY 1
    HAVING ${totalContactsBalance()} > 0
    ORDER BY count DESC
  `,
}

// Total contacts per channel as of `to` under an inbox filter: the exact
// current per-inbox counts walked back over the events after `to`, which all
// carry their inbox (see `getTotalBefore` for why the event balance is not
// usable there). Channel only: the per-inbox counts have no other dimension.
const inboxFilteredChannelTotals = ({
  workspaceId,
  to,
  ...filter
}: FilteredTimeRangeQuery): SqlFragment => sql`
  SELECT
    current.channel AS dimension,
    (current.total - COALESCE(since.net, 0))::int AS count,
    (current.total - COALESCE(since.net, 0))::int AS "uniqueContacts"
  FROM (
    SELECT i."channel" AS channel, SUM(ics."totalContacts")::int AS total
    FROM "InboxContactStat" ics
    INNER JOIN "Inbox" i ON i.id = ics."inboxId"
    WHERE i."workspaceId" = ${workspaceId}${buildEventFilter(filter, {
      channel: sql`i."channel"`,
      inboxId: sql`ics."inboxId"`,
    })}
    GROUP BY 1
  ) current
  LEFT JOIN (
    SELECT "channel" AS channel, ${totalContactsBalance()} AS net
    FROM "AnalyticsContactEvent"
    WHERE "workspaceId" = ${workspaceId}${buildEventFilter(filter)}
      AND "occurredAt" > ${to}
      AND "eventType" IN ('contact_created', 'contact_deleted')
    GROUP BY 1
  ) since ON since.channel = current.channel
  WHERE current.total - COALESCE(since.net, 0) > 0
  ORDER BY count DESC
`

export class ContactStatsRepository extends BaseRepository {
  async insertEvents(
    payloads: InsertContactEventRow[],
    eventType: ContactEventType,
  ): Promise<void> {
    if (payloads.length === 0) {
      return
    }
    const rows = payloads.map((p) => ({
      eventId: getEventBusEventId(p) ?? createId(),
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
      inboxId: p.inboxId ?? null,
      language: p.language ?? null,
      country: p.country ?? null,
      metadata: p.metadata ?? null,
    }))
    await db
      .insert(analyticsContactEventModel)
      .values(rows)
      .onConflictDoNothing()
  }

  async getStatsByMinute(
    props: FilteredTimeRangeQuery & {
      eventTypes?: ContactEventType[]
    },
  ): Promise<ContactStats[]> {
    const { workspaceId, from, to, eventTypes } = props
    const eventFilter = buildEventFilter(props)

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
      WHERE "workspaceId" = ${workspaceId}${eventFilter}
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
    props: FilteredTimeRangeQuery & {
      eventTypes?: ContactEventType[]
    },
  ): Promise<ContactStats[]> {
    const { workspaceId, from, to, eventTypes } = props
    const eventFilter = buildEventFilter(props)

    const eventTypeFilter =
      eventTypes && eventTypes.length > 0
        ? sql` AND "eventType" IN (${sql.join(
            eventTypes.map((t) => sql`${t}`),
            sql`, `,
          )})`
        : sql``

    // The hourly cagg carries no `inboxId`, so a filtered read buckets the raw
    // hypertable by hour instead and keeps the same output shape.
    const query = hasAnalyticsFilter(props)
      ? sql`
          SELECT
            time_bucket('1 hour', "occurredAt") AS bucket,
            "eventType",
            COUNT(*)::int AS count
          FROM "AnalyticsContactEvent"
          WHERE "workspaceId" = ${workspaceId}${eventFilter}
            AND "occurredAt" >= ${from}
            AND "occurredAt" <= ${to}
            ${eventTypeFilter}
          GROUP BY 1, 2
          ORDER BY 1 ASC, 2 ASC
        `
      : sql`
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
        `
    const result = await db.execute(query)

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
    props: FilteredTimeRangeQuery & {
      eventTypes?: ContactEventType[]
    },
  ): Promise<ContactStats[]> {
    const { workspaceId, from, to, timezone, eventTypes } = props
    const eventFilter = buildEventFilter(props)

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

    const query = shouldUseCagg(props)
      ? sql`
          SELECT
            time_bucket('1 day', bucket AT TIME ZONE ${resolvedTimezone(timezone)} AT TIME ZONE 'UTC') AS bucket,
            "eventType",
            SUM(count)::int AS count
          FROM analytics_contact_events_hourly
          WHERE "workspaceId" = ${workspaceId}
            AND bucket >= ${from}
            AND bucket <= ${to}
            ${eventTypeFilter}
          GROUP BY 1, 2
          ORDER BY 1 ASC, 2 ASC
        `
      : sql`
          SELECT
            time_bucket('1 day', "occurredAt" AT TIME ZONE ${resolvedTimezone(timezone)} AT TIME ZONE 'UTC') AS bucket,
            "eventType",
            COUNT(*)::int AS count
          FROM "AnalyticsContactEvent"
          WHERE "workspaceId" = ${workspaceId}${eventFilter}
            AND "occurredAt" >= ${from}
            AND "occurredAt" <= ${to}
            ${eventTypeFilter}
          GROUP BY 1, 2
          ORDER BY 1 ASC, 2 ASC
        `

    const result = await db.execute(query)

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
    props: FilteredTimeRangeQuery & {
      eventTypes?: ContactEventType[]
    },
  ): Promise<ContactStats[]> {
    const { workspaceId, from, to, timezone, eventTypes } = props
    const eventFilter = buildEventFilter(props)

    const eventTypeFilter =
      eventTypes && eventTypes.length > 0
        ? sql` AND "eventType" IN (${sql.join(
            eventTypes.map((t) => sql`${t}`),
            sql`, `,
          )})`
        : sql``

    // Month granularity always > 7 days — use raw hypertable
    const result = await db.execute(sql`
      SELECT
        time_bucket('1 month', "occurredAt" AT TIME ZONE ${resolvedTimezone(timezone)} AT TIME ZONE 'UTC') AS bucket,
        "eventType",
        COUNT(*)::int AS count
      FROM "AnalyticsContactEvent"
      WHERE "workspaceId" = ${workspaceId}${eventFilter}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
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

  /**
   * Contacts that existed before `start` (created minus deleted), the
   * starting point of the running total.
   *
   * Under an inbox filter the event balance is not usable: events recorded
   * before inbox tracking carry no inbox, so deleting an older contact would
   * subtract a deletion whose creation the filter cannot see. The total is
   * then anchored on the exact current per-inbox count and walked back over
   * the events since `start`, which all carry their inbox.
   */
  private async getTotalBefore(
    props: FilteredTimeRangeQuery,
    start: SqlFragment,
  ): Promise<number> {
    const { workspaceId } = props
    const eventFilter = buildEventFilter(props)
    const isInboxFiltered = normalizeAnalyticsFilters(props).inboxIds.length > 0
    // KNOWN PERF: the unfiltered baseline scans every row before `start`;
    // the inbox-filtered one scans only rows since `start`.
    const result = await db.execute(sql`
      SELECT COALESCE(
        COUNT(*) FILTER (WHERE "eventType" = 'contact_created') -
        COUNT(*) FILTER (WHERE "eventType" = 'contact_deleted'),
        0
      )::int AS net
      FROM "AnalyticsContactEvent"
      WHERE "workspaceId" = ${workspaceId}${eventFilter}
        AND "occurredAt" ${isInboxFiltered ? sql`>=` : sql`<`} ${start}
        AND "eventType" IN ('contact_created', 'contact_deleted')
    `)
    const net = Number(
      (result.rows[0] as { net: number } | undefined)?.net ?? 0,
    )
    if (!isInboxFiltered) {
      return net
    }
    // The per-inbox count is maintained separately; never let a lag between
    // the two sources show a negative total.
    return Math.max(0, (await this.getContactsCount(props)) - net)
  }

  async getContactCountsPerDay(
    props: FilteredTimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    if (shouldUseMonthlyGranularity(props)) {
      return this.getContactCountsPerMonth(props)
    }

    const { workspaceId, from, to, timezone } = props

    const eventFilter = buildEventFilter(props)

    const dayStart = sql`date_trunc('day', ${from}::timestamptz AT TIME ZONE ${resolvedTimezone(timezone)}) AT TIME ZONE ${resolvedTimezone(timezone)}`

    // Baseline always queries the raw hypertable: the cagg refresh policy only
    // materializes the last 7 days, so older events are absent from the cagg
    // and would return 0 as the baseline for any workspace with older data.
    const seriesQuery = shouldUseCagg(props)
      ? sql`
          SELECT
            time_bucket('1 day', bucket AT TIME ZONE ${resolvedTimezone(timezone)} AT TIME ZONE 'UTC') AS day,
            SUM(CASE WHEN "eventType" = 'contact_created' THEN count ELSE 0 END)::int -
            SUM(CASE WHEN "eventType" = 'contact_deleted' THEN count ELSE 0 END)::int AS net
          FROM analytics_contact_events_hourly
          WHERE "workspaceId" = ${workspaceId}
            AND bucket >= ${dayStart}
            AND bucket <= ${to}
            AND "eventType" IN ('contact_created', 'contact_deleted')
          GROUP BY 1
          ORDER BY 1 ASC
        `
      : sql`
          SELECT
            time_bucket('1 day', "occurredAt" AT TIME ZONE ${resolvedTimezone(timezone)} AT TIME ZONE 'UTC') AS day,
            SUM(CASE WHEN "eventType" = 'contact_created' THEN 1 ELSE 0 END)::int -
            SUM(CASE WHEN "eventType" = 'contact_deleted' THEN 1 ELSE 0 END)::int AS net
          FROM "AnalyticsContactEvent"
          WHERE "workspaceId" = ${workspaceId}${eventFilter}
            AND "occurredAt" >= ${dayStart}
            AND "occurredAt" <= ${to}
            AND "eventType" IN ('contact_created', 'contact_deleted')
          GROUP BY 1
          ORDER BY 1 ASC
        `

    const [baseline, seriesResult] = await Promise.all([
      this.getTotalBefore(props, dayStart),
      db.execute(seriesQuery),
    ])

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
    props: FilteredTimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    const { workspaceId, from, to, timezone } = props
    const eventFilter = buildEventFilter(props)

    const monthStart = sql`date_trunc('month', ${from}::timestamptz AT TIME ZONE ${resolvedTimezone(timezone)}) AT TIME ZONE ${resolvedTimezone(timezone)}`

    const [baseline, seriesResult] = await Promise.all([
      this.getTotalBefore(props, monthStart),
      db.execute(sql`
        SELECT
          time_bucket('1 month', "occurredAt" AT TIME ZONE ${resolvedTimezone(timezone)} AT TIME ZONE 'UTC') AS month,
          SUM(CASE WHEN "eventType" = 'contact_created' THEN 1 ELSE 0 END)::int -
          SUM(CASE WHEN "eventType" = 'contact_deleted' THEN 1 ELSE 0 END)::int AS net
        FROM "AnalyticsContactEvent"
        WHERE "workspaceId" = ${workspaceId}${eventFilter}
          AND "occurredAt" >= ${monthStart}
          AND "occurredAt" <= ${to}
          AND "eventType" IN ('contact_created', 'contact_deleted')
        GROUP BY 1
        ORDER BY 1 ASC
      `),
    ])

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
    props: FilteredTimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    if (shouldUseMonthlyGranularity(props)) {
      return this.getNewContactsPerMonth(props)
    }

    const { workspaceId, from, to, timezone } = props

    const eventFilter = buildEventFilter(props)

    // Use raw table with COUNT(DISTINCT contactId) so duplicate
    // `contact_created` events for the same contact within a day collapse to
    // 1. Matches the legacy ClickHouse `uniqMerge` semantic and keeps the sum
    // of daily values consistent with `getNewContactsCount`.
    const result = await db.execute(sql`
      SELECT
        time_bucket('1 day', "occurredAt" AT TIME ZONE ${resolvedTimezone(timezone)} AT TIME ZONE 'UTC') AS day,
        COUNT(DISTINCT "contactId")::int AS new_contacts
      FROM "AnalyticsContactEvent"
      WHERE "workspaceId" = ${workspaceId}${eventFilter}
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
    props: FilteredTimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    const { workspaceId, from, to, timezone } = props
    const eventFilter = buildEventFilter(props)

    const result = await db.execute(sql`
      SELECT
        time_bucket('1 month', "occurredAt" AT TIME ZONE ${resolvedTimezone(timezone)} AT TIME ZONE 'UTC') AS month,
        COUNT(DISTINCT "contactId")::int AS new_contacts
      FROM "AnalyticsContactEvent"
      WHERE "workspaceId" = ${workspaceId}${eventFilter}
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

  async getNewContactsCount(props: FilteredTimeRangeQuery): Promise<number> {
    const { workspaceId, from, to } = props
    const eventFilter = buildEventFilter(props)

    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT "contactId")::int AS count
      FROM "AnalyticsContactEvent"
      WHERE "workspaceId" = ${workspaceId}${eventFilter}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND "eventType" = 'contact_created'
    `)

    return Number((result.rows[0] as { count: number } | undefined)?.count ?? 0)
  }

  async getBlockedContactsPerDay(
    props: FilteredTimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    if (shouldUseMonthlyGranularity(props)) {
      return this.getBlockedContactsPerMonth(props)
    }

    const { workspaceId, from, to, timezone } = props

    const eventFilter = buildEventFilter(props)

    // COUNT(DISTINCT contactId) — same contact blocked twice in a day (manual
    // path + auto-detect via message:failed) collapses to 1.
    const result = await db.execute(sql`
      SELECT
        time_bucket('1 day', "occurredAt" AT TIME ZONE ${resolvedTimezone(timezone)} AT TIME ZONE 'UTC') AS day,
        COUNT(DISTINCT "contactId")::int AS blocked_contacts
      FROM "AnalyticsContactEvent"
      WHERE "workspaceId" = ${workspaceId}${eventFilter}
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
    props: FilteredTimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    const { workspaceId, from, to, timezone } = props
    const eventFilter = buildEventFilter(props)

    const result = await db.execute(sql`
      SELECT
        time_bucket('1 month', "occurredAt" AT TIME ZONE ${resolvedTimezone(timezone)} AT TIME ZONE 'UTC') AS month,
        COUNT(DISTINCT "contactId")::int AS blocked_contacts
      FROM "AnalyticsContactEvent"
      WHERE "workspaceId" = ${workspaceId}${eventFilter}
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

  async getBlockedContactsCount(
    props: FilteredTimeRangeQuery,
  ): Promise<number> {
    const { workspaceId, from, to } = props
    const eventFilter = buildEventFilter(props)

    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT "contactId")::int AS count
      FROM "AnalyticsContactEvent"
      WHERE "workspaceId" = ${workspaceId}${eventFilter}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND "eventType" = 'contact_blocked'
    `)

    return Number((result.rows[0] as { count: number } | undefined)?.count ?? 0)
  }

  async getContactsCount(props: FilteredTimeRangeQuery): Promise<number> {
    const { workspaceId } = props
    const inboxFilter = buildEventFilter(props, {
      channel: sql`i."channel"`,
      inboxId: sql`ics."inboxId"`,
    })

    const result = await db.execute(sql`
      SELECT COALESCE(SUM(ics."totalContacts"), 0)::int AS total
      FROM "InboxContactStat" ics
      INNER JOIN "Inbox" i ON i.id = ics."inboxId"
      WHERE i."workspaceId" = ${workspaceId}${inboxFilter}
    `)

    return Number((result.rows[0] as { total: number } | undefined)?.total ?? 0)
  }

  async getContactsByDimension(
    props: ContactsByDimensionQuery,
  ): Promise<ContactsByDimension[]> {
    const column = sql.identifier(CONTACT_DIMENSION_COLUMNS[props.dimension])
    const isInboxFilteredTotal =
      props.metric === "total" &&
      normalizeAnalyticsFilters(props).inboxIds.length > 0
    const result = await db.execute(
      isInboxFilteredTotal
        ? inboxFilteredChannelTotals(props)
        : CONTACT_DIMENSION_QUERIES[props.metric](props, column),
    )

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
