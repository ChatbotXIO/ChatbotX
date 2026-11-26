import {
  channelPostMetricBits,
  POST_METRIC_WINDOW_DAYS,
  type PostMetricName,
} from "@chatbotx.io/utils/post-metrics"
import { fromZonedTime } from "date-fns-tz"
import { type DatabaseClient, db, type SQL, sql } from "../../client"

/** Which posts a read looks at. Every read is scoped to one workspace. */
export type PostMetricScope = {
  channels?: string[]
  contentTypes?: string[]
  inboxIds?: string[]
  topicIds?: string[]
  workspaceId: string
}

/** An inclusive range of workspace-local days (`YYYY-MM-DD`). */
export type PostMetricDayRange = { from: string; to: string }

/** Most posts a coverage read looks at; a larger scope is reported as truncated. */
export const POST_METRIC_COVERAGE_POST_CAP = 20_000
/** Most groups a timeseries returns; the rest are cut by total gain. */
export const POST_METRIC_MAX_GROUPS = 50
/** Most posts a best-times read samples. */
export const POST_METRIC_BEST_TIMES_SAMPLE_CAP = 5000

// The metric name picks a column from this closed map; no caller text reaches
// the SQL.
const GAIN_COLUMN: Record<PostMetricName, string> = {
  comments: "commentsGain",
  engagement: "engagementGain",
  reactions: "reactionsGain",
  shares: "sharesGain",
  views: "viewsGain",
}
const TOTAL_COLUMN: Record<PostMetricName, string> = {
  comments: "commentsCount",
  engagement: "engagementCount",
  reactions: "reactionsCount",
  shares: "sharesCount",
  views: "viewsCount",
}
const gainOf = (metric: PostMetricName): SQL =>
  sql.raw(`d."${GAIN_COLUMN[metric]}"`)
const totalOf = (metric: PostMetricName): SQL =>
  sql.raw(`d."${TOTAL_COLUMN[metric]}"`)

/** The bit a stored count needs in `metricsKnownMask` (views are known when not null). */
const knownCondition = (metric: PostMetricName): SQL => {
  switch (metric) {
    case "comments":
      return sql.raw(
        `(cp."metricsKnownMask" & ${channelPostMetricBits.comments}) > 0`,
      )
    case "reactions":
      return sql.raw(
        `(cp."metricsKnownMask" & ${channelPostMetricBits.reactions}) > 0`,
      )
    case "shares":
      return sql.raw(
        `(cp."metricsKnownMask" & ${channelPostMetricBits.shares}) > 0`,
      )
    case "engagement":
      return sql.raw(`cp."metricsKnownMask" <> 0`)
    case "views":
      return sql.raw(`cp."viewsCount" IS NOT NULL`)
    default: {
      const exhaustive: never = metric
      return exhaustive
    }
  }
}

const textArray = (values: string[]): SQL => sql`${sql.param(values)}::text[]`

/**
 * The shared FROM/WHERE of every read over the snapshots: the daily rows of
 * one workspace in a day range. The post is joined (by primary key) only when
 * a filter needs its columns (content type, topics) or a ranking leaves
 * removed posts out. Bounded by the range (at most 366 days) and the
 * workspace-leading primary key.
 */
const dailyFrom = (
  scope: PostMetricScope,
  range: PostMetricDayRange,
  options: { liveOnly: boolean } = { liveOnly: false },
): SQL => {
  // Gains already happened: removing a post later must not rewrite the past of
  // a summary or a chart. Only a ranking leaves removed posts out.
  const conditions: SQL[] = [
    sql`d."workspaceId" = ${scope.workspaceId}::bigint`,
    sql`d."day" >= ${range.from}::date`,
    sql`d."day" <= ${range.to}::date`,
  ]
  if (options.liveOnly) {
    conditions.push(sql`cp."removedAt" IS NULL`)
  }
  if (scope.channels?.length) {
    conditions.push(sql`d."channel" = ANY(${textArray(scope.channels)})`)
  }
  if (scope.inboxIds?.length) {
    conditions.push(
      sql`d."inboxId" = ANY(${sql.param(scope.inboxIds)}::bigint[])`,
    )
  }
  if (scope.contentTypes?.length) {
    conditions.push(
      sql`cp."contentType"::text = ANY(${textArray(scope.contentTypes)})`,
    )
  }
  if (scope.topicIds?.length) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM "ChannelPostToPostTopic" t WHERE t."channelPostId" = cp."id" AND t."postTopicId" = ANY(${sql.param(scope.topicIds)}::bigint[]))`,
    )
  }
  const needsPost =
    options.liveOnly || !!scope.contentTypes?.length || !!scope.topicIds?.length
  const postJoin = needsPost
    ? sql`JOIN "ChannelPost" cp ON cp."id" = d."channelPostId" AND cp."workspaceId" = d."workspaceId"`
    : sql``
  return sql`
    FROM "ChannelPostMetricDaily" d
    ${postJoin}
    WHERE ${sql.join(conditions, sql` AND `)}`
}

/** The post filters of a scope on a `ChannelPost` aliased `cp` (workspace and removal are the caller's). */
const postFilterConditions = (scope: PostMetricScope): SQL[] => {
  const conditions: SQL[] = []
  if (scope.channels?.length) {
    conditions.push(sql`cp."channel" = ANY(${textArray(scope.channels)})`)
  }
  if (scope.inboxIds?.length) {
    conditions.push(
      sql`cp."inboxId" = ANY(${sql.param(scope.inboxIds)}::bigint[])`,
    )
  }
  if (scope.contentTypes?.length) {
    conditions.push(
      sql`cp."contentType"::text = ANY(${textArray(scope.contentTypes)})`,
    )
  }
  if (scope.topicIds?.length) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM "ChannelPostToPostTopic" t WHERE t."channelPostId" = cp."id" AND t."postTopicId" = ANY(${sql.param(scope.topicIds)}::bigint[]))`,
    )
  }
  return conditions
}

/**
 * Whether any post of the scope reports `metric` (the post, not the snapshots:
 * snapshots are sparse, so a quiet window has none while the platform still
 * reports the count, and a quiet window is 0, not "not reported").
 */
const platformReports = (scope: PostMetricScope, metric: PostMetricName): SQL =>
  sql`EXISTS (SELECT 1 FROM "ChannelPost" cp WHERE ${sql.join(
    [
      sql`cp."workspaceId" = ${scope.workspaceId}::bigint`,
      knownCondition(metric),
      ...postFilterConditions(scope),
    ],
    sql` AND `,
  )})`

/**
 * The instants bounding a local-day range: local midnight of `from` and of the
 * day after `to`. Computed here from the (Intl-validated) zone, so the query
 * compares plain timestamps (index-friendly) and a zone PostgreSQL does not
 * know cannot fail it.
 */
const dayBounds = (
  range: PostMetricDayRange,
  timezone: string,
): { end: Date; start: Date } => {
  const next = new Date(`${range.to}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return {
    end: fromZonedTime(`${next.toISOString().slice(0, 10)}T00:00:00`, timezone),
    start: fromZonedTime(`${range.from}T00:00:00`, timezone),
  }
}

/** `COALESCE(publishedAt, createdAt)` (the `sortAt` index expression) inside the local-day range. */
const sortedWithin = (range: PostMetricDayRange, timezone: string): SQL => {
  const { end, start } = dayBounds(range, timezone)
  return sql`COALESCE(cp."publishedAt", cp."createdAt") >= ${start}::timestamptz AND COALESCE(cp."publishedAt", cp."createdAt") < ${end}::timestamptz`
}

const toNumber = (value: unknown): number => Number(value ?? 0)

export type PostMetricGains = Record<PostMetricName, number>

export type PostMetricSummaryRow = {
  /** Per metric: does any post of the scope report it (unknown is not zero, a quiet window is). */
  available: Record<PostMetricName, boolean>
  current: PostMetricGains
  previous: PostMetricGains
}

const METRICS: readonly PostMetricName[] = [
  "comments",
  "reactions",
  "shares",
  "engagement",
  "views",
]

/**
 * Gains of the range and of the range before it (the caller passes both days
 * ranges), in one pass over the snapshots.
 */
export const summarizePostMetrics = async (
  input: {
    current: PostMetricDayRange
    previous: PostMetricDayRange
    scope: PostMetricScope
  },
  tx: DatabaseClient = db,
): Promise<PostMetricSummaryRow> => {
  const { current, previous, scope } = input
  const span: PostMetricDayRange = { from: previous.from, to: current.to }
  const columns = METRICS.flatMap((metric) => [
    sql`COALESCE(sum(${gainOf(metric)}) FILTER (WHERE d."day" >= ${current.from}::date), 0) AS ${sql.identifier(`cur_${metric}`)}`,
    sql`COALESCE(sum(${gainOf(metric)}) FILTER (WHERE d."day" <= ${previous.to}::date), 0) AS ${sql.identifier(`prev_${metric}`)}`,
    sql`${platformReports(scope, metric)} AS ${sql.identifier(`known_${metric}`)}`,
  ])
  const result = await tx.execute<Record<string, unknown>>(sql`
    SELECT ${sql.join(columns, sql`, `)} ${dailyFrom(scope, span)}`)
  const row = result.rows[0] ?? {}
  const pick = (prefix: string): PostMetricGains => ({
    comments: toNumber(row[`${prefix}_comments`]),
    engagement: toNumber(row[`${prefix}_engagement`]),
    reactions: toNumber(row[`${prefix}_reactions`]),
    shares: toNumber(row[`${prefix}_shares`]),
    views: toNumber(row[`${prefix}_views`]),
  })
  return {
    available: {
      comments: Boolean(row.known_comments),
      engagement: Boolean(row.known_engagement),
      reactions: Boolean(row.known_reactions),
      shares: Boolean(row.known_shares),
      views: Boolean(row.known_views),
    },
    current: pick("cur"),
    previous: pick("prev"),
  }
}

export type PostMetricTimeseriesGroupBy = "none" | "channel" | "inbox"

const timeseriesKey = (groupBy: PostMetricTimeseriesGroupBy): SQL => {
  if (groupBy === "channel") {
    return sql`d."channel"`
  }
  return groupBy === "inbox" ? sql`d."inboxId"::text` : sql`'all'`
}
export type PostMetricTimeseriesRow = {
  day: string
  gain: number
  groupKey: string
}

/**
 * Daily gains of one metric, optionally per channel or inbox, cut to the
 * `POST_METRIC_MAX_GROUPS` groups with the largest total. Days without a row
 * are not returned: the caller fills the gaps.
 */
export const timeseriesPostMetrics = async (
  input: {
    groupBy: PostMetricTimeseriesGroupBy
    metric: PostMetricName
    range: PostMetricDayRange
    scope: PostMetricScope
  },
  tx: DatabaseClient = db,
): Promise<{ available: boolean; rows: PostMetricTimeseriesRow[] }> => {
  const { groupBy, metric, range, scope } = input
  const key = timeseriesKey(groupBy)
  // The availability rides on the same statement: the left join keeps one row
  // when the window has no snapshot at all.
  const result = await tx.execute<{
    available: boolean
    day: string | null
    gain: string | null
    groupKey: string | null
  }>(sql`
    WITH agg AS (
      SELECT to_char(d."day", 'YYYY-MM-DD') AS "day", ${key} AS "groupKey",
        sum(${gainOf(metric)}) AS "gain"
      ${dailyFrom(scope, range)}
      GROUP BY 1, 2
    ),
    top AS (
      SELECT "groupKey" FROM agg GROUP BY "groupKey"
      ORDER BY sum("gain") DESC, "groupKey" LIMIT ${POST_METRIC_MAX_GROUPS}
    )
    SELECT t."day", t."groupKey", t."gain", ${platformReports(scope, metric)} AS "available"
    FROM (SELECT 1) AS one
    LEFT JOIN (SELECT agg."day", agg."groupKey", agg."gain" FROM agg JOIN top USING ("groupKey")) AS t ON true
    ORDER BY t."day", t."groupKey"`)
  const available = result.rows.some((row) => row.available)
  const data = result.rows.filter(
    (row): row is typeof row & { day: string; groupKey: string } =>
      row.day !== null && row.groupKey !== null,
  )
  return {
    available,
    rows: data.map((row) => ({
      day: row.day,
      gain: toNumber(row.gain),
      groupKey: row.groupKey,
    })),
  }
}

export type TopPostRankBy = "gained" | "total"
export type TopPostRow = {
  caption: string | null
  channel: string
  channelPostId: string
  contentType: string | null
  gained: number
  inboxId: string
  inboxName: string
  permalink: string | null
  publishedAt: Date | null
  thumbnail: string | null
  total: number
}

type TopPostRaw = Omit<TopPostRow, "gained" | "publishedAt" | "total"> & {
  gained: string | null
  publishedAt: string | Date | null
  total: string | null
}

const mapTopPost = (row: TopPostRaw): TopPostRow => ({
  ...row,
  gained: toNumber(row.gained),
  publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
  total: toNumber(row.total),
})

// Built when a query runs, not when the module loads: a module that only
// imports the repositories (and mocks `sql`) must not execute it.
const topPostColumns = (): SQL =>
  sql.raw(
    `cp."id" AS "channelPostId", cp."channel", cp."inboxId", i."name" AS "inboxName", cp."caption", cp."permalink", cp."thumbnail", cp."publishedAt", cp."contentType"::text AS "contentType"`,
  )

/**
 * The posts of a scope ranked by what they gained in the range (`gained`, from
 * the snapshots), or by their current platform total among the posts published
 * in the range (`total`). A post whose metric was never reported is left out
 * rather than ranked as zero. `limit` is the caller's cap (at most 50).
 */
export const topPostsByMetric = async (
  input: {
    limit: number
    metric: PostMetricName
    range: PostMetricDayRange
    rankBy: TopPostRankBy
    scope: PostMetricScope
    timezone: string
  },
  tx: DatabaseClient = db,
): Promise<TopPostRow[]> => {
  const { limit, metric, range, rankBy, scope, timezone } = input
  if (rankBy === "gained") {
    const result = await tx.execute<TopPostRaw>(sql`
      WITH ranked AS (
        SELECT d."channelPostId", sum(${gainOf(metric)}) AS "gained"
        ${dailyFrom(scope, range, { liveOnly: true })}
        GROUP BY d."channelPostId"
        HAVING bool_or(${totalOf(metric)} IS NOT NULL)
        ORDER BY sum(${gainOf(metric)}) DESC, d."channelPostId" DESC
        LIMIT ${limit}
      )
      SELECT ${topPostColumns()}, r."gained",
        ${sql.raw(totalExpression(metric))} AS "total"
      FROM ranked r
      JOIN "ChannelPost" cp ON cp."id" = r."channelPostId"
      JOIN "Inbox" i ON i."id" = cp."inboxId"
      WHERE cp."workspaceId" = ${scope.workspaceId}::bigint
      ORDER BY r."gained" DESC, cp."id" DESC`)
    return result.rows.map(mapTopPost)
  }
  const conditions: SQL[] = [
    sql`cp."workspaceId" = ${scope.workspaceId}::bigint`,
    sql`cp."removedAt" IS NULL`,
    knownCondition(metric),
    sortedWithin(range, timezone),
  ]
  conditions.push(...postFilterConditions(scope))
  const result = await tx.execute<TopPostRaw>(sql`
    SELECT ${topPostColumns()}, NULL::bigint AS "gained", ${sql.raw(totalExpression(metric))} AS "total"
    FROM "ChannelPost" cp
    JOIN "Inbox" i ON i."id" = cp."inboxId"
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY ${sql.raw(totalExpression(metric))} DESC, cp."id" DESC
    LIMIT ${limit}`)
  return result.rows.map(mapTopPost)
}

function totalExpression(metric: PostMetricName): string {
  return metric === "views"
    ? `COALESCE(cp."viewsCount", 0)`
    : `cp."${TOTAL_COLUMN[metric]}"`
}

export type BestTimesSample = {
  engagement: number
  inboxId: string
  publishedAt: Date
}

/**
 * Posts whose engagement can be compared by time of day: published between
 * `now - 90 days` and `now - 3 days` (young posts have not collected their
 * engagement yet), not removed, with a reported engagement, newest first, at
 * most `POST_METRIC_BEST_TIMES_SAMPLE_CAP`.
 */
export const sampleBestTimes = async (
  input: { now: Date; scope: PostMetricScope },
  tx: DatabaseClient = db,
): Promise<{ capped: boolean; samples: BestTimesSample[] }> => {
  const { now, scope } = input
  const conditions: SQL[] = [
    sql`cp."workspaceId" = ${scope.workspaceId}::bigint`,
    sql`cp."removedAt" IS NULL`,
    sql`cp."publishedAt" IS NOT NULL`,
    sql`cp."metricsKnownMask" <> 0`,
    sql`cp."publishedAt" >= ${now}::timestamptz - make_interval(days => ${POST_METRIC_WINDOW_DAYS})`,
    sql`cp."publishedAt" <= ${now}::timestamptz - make_interval(days => 3)`,
  ]
  conditions.push(...postFilterConditions(scope))
  const result = await tx.execute<{
    engagement: string
    inboxId: string
    publishedAt: string | Date
  }>(sql`
    SELECT cp."inboxId", cp."publishedAt", cp."engagementCount" AS "engagement"
    FROM "ChannelPost" cp
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY COALESCE(cp."publishedAt", cp."createdAt") DESC, cp."id" DESC
    LIMIT ${POST_METRIC_BEST_TIMES_SAMPLE_CAP + 1}`)
  const capped = result.rows.length > POST_METRIC_BEST_TIMES_SAMPLE_CAP
  return {
    capped,
    samples: result.rows
      .slice(0, POST_METRIC_BEST_TIMES_SAMPLE_CAP)
      .map((row) => ({
        engagement: toNumber(row.engagement),
        inboxId: row.inboxId,
        publishedAt: new Date(row.publishedAt),
      })),
  }
}

export type PostMetricCoverageRow = {
  channel: string
  /** Live posts in the window that match the scope. */
  posts: number
  /** Of them, posts with at least one snapshot. */
  postsMeasured: number
  /** Of them, posts with a baseline and a later observation (a real trend). */
  postsWithHistory: number
  /** First day with a snapshot in the scope, or null when there is none. */
  trackingSince: string | null
}

/**
 * How much of the scope the snapshots really cover, per channel: so an empty
 * or partial chart is never read as "no activity". Looks at the posts of the
 * last 90 days only (the snapshot window) and at most
 * `POST_METRIC_COVERAGE_POST_CAP` of them.
 */
export const postMetricCoverage = async (
  input: { now: Date; scope: PostMetricScope },
  tx: DatabaseClient = db,
): Promise<{ rows: PostMetricCoverageRow[]; truncated: boolean }> => {
  const { now, scope } = input
  const conditions: SQL[] = [
    sql`cp."workspaceId" = ${scope.workspaceId}::bigint`,
    sql`cp."removedAt" IS NULL`,
    sql`COALESCE(cp."publishedAt", cp."createdAt") >= ${now}::timestamptz - make_interval(days => ${POST_METRIC_WINDOW_DAYS})`,
  ]
  conditions.push(...postFilterConditions(scope))
  const result = await tx.execute<{
    channel: string
    posts: string
    postsMeasured: string
    postsWithHistory: string
    totalPosts: string
    trackingSince: string | null
  }>(sql`
    WITH scoped AS (
      SELECT cp."id", cp."channel"
      FROM "ChannelPost" cp
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY COALESCE(cp."publishedAt", cp."createdAt") DESC, cp."id" DESC
      LIMIT ${POST_METRIC_COVERAGE_POST_CAP + 1}
    ),
    snap AS (
      SELECT d."channelPostId", count(*) AS "days", bool_or(NOT d."isBaseline" OR d."commentsGain" <> 0 OR d."reactionsGain" <> 0 OR d."sharesGain" <> 0 OR d."viewsGain" <> 0) AS "hasRealRow",
        min(d."day") AS "firstDay"
      FROM "ChannelPostMetricDaily" d
      WHERE d."workspaceId" = ${scope.workspaceId}::bigint
        AND d."day" >= (${now}::timestamptz - make_interval(days => ${POST_METRIC_WINDOW_DAYS + 2}))::date
        AND d."channelPostId" IN (SELECT "id" FROM scoped)
      GROUP BY d."channelPostId"
    )
    SELECT s."channel", count(*) AS "posts", count(snap."channelPostId") AS "postsMeasured",
      count(*) FILTER (WHERE snap."days" >= 2 OR snap."hasRealRow") AS "postsWithHistory",
      to_char(min(snap."firstDay"), 'YYYY-MM-DD') AS "trackingSince",
      sum(count(*)) OVER () AS "totalPosts"
    FROM scoped s LEFT JOIN snap ON snap."channelPostId" = s."id"
    GROUP BY s."channel" ORDER BY s."channel"`)
  const total = Number(result.rows[0]?.totalPosts ?? 0)
  return {
    rows: result.rows.map((row) => ({
      channel: row.channel,
      posts: toNumber(row.posts),
      postsMeasured: toNumber(row.postsMeasured),
      postsWithHistory: toNumber(row.postsWithHistory),
      trackingSince: row.trackingSince,
    })),
    truncated: total > POST_METRIC_COVERAGE_POST_CAP,
  }
}

export type PostMetricPointRow = {
  day: string
  isBaseline: boolean
  reactions: { gain: number; total: number | null }
  comments: { gain: number; total: number | null }
  shares: { gain: number; total: number | null }
  engagement: { gain: number; total: number | null }
  views: { gain: number; total: number | null }
}

const POINT_COLUMNS = `d."channelPostId"::text AS "channelPostId", to_char(d."day", 'YYYY-MM-DD') AS "day", d."isBaseline",
      d."commentsCount", d."commentsGain", d."reactionsCount", d."reactionsGain", d."sharesCount", d."sharesGain",
      d."engagementCount", d."engagementGain", d."viewsCount", d."viewsGain"`

const mapPoint = (row: Record<string, unknown>): PostMetricPointRow => {
  const cell = (name: string) => ({
    gain: toNumber(row[`${name}Gain`]),
    total:
      row[`${name}Count`] === null || row[`${name}Count`] === undefined
        ? null
        : toNumber(row[`${name}Count`]),
  })
  return {
    comments: cell("comments"),
    day: String(row.day),
    engagement: cell("engagement"),
    isBaseline: Boolean(row.isBaseline),
    reactions: cell("reactions"),
    shares: cell("shares"),
    views: cell("views"),
  }
}

/** One post's snapshots in a day range, oldest first (at most one row per day). */
export const listPostMetricPoints = async (
  input: {
    channelPostIds: string[]
    range: PostMetricDayRange
    workspaceId: string
  },
  tx: DatabaseClient = db,
): Promise<Map<string, PostMetricPointRow[]>> => {
  const { channelPostIds, range, workspaceId } = input
  const grouped = new Map<string, PostMetricPointRow[]>()
  if (channelPostIds.length === 0) {
    return grouped
  }
  const result = await tx.execute<Record<string, unknown>>(sql`
    SELECT ${sql.raw(POINT_COLUMNS)}
    FROM "ChannelPostMetricDaily" d
    WHERE d."workspaceId" = ${workspaceId}::bigint
      AND d."channelPostId" = ANY(${sql.param(channelPostIds)}::bigint[])
      AND d."day" >= ${range.from}::date AND d."day" <= ${range.to}::date
    ORDER BY d."channelPostId", d."day"`)
  for (const row of result.rows) {
    const id = String(row.channelPostId)
    grouped.set(id, [...(grouped.get(id) ?? []), mapPoint(row)])
  }
  return grouped
}

/**
 * The latest snapshot of each post on or before `to`, NOT bounded below by the
 * range start: a post's cumulative total at the end of a window does not depend
 * on whether it moved inside it. Posts with no such snapshot are absent.
 */
export const findLatestPostMetricPoints = async (
  input: { channelPostIds: string[]; to: string; workspaceId: string },
  tx: DatabaseClient = db,
): Promise<Map<string, PostMetricPointRow>> => {
  const latest = new Map<string, PostMetricPointRow>()
  if (input.channelPostIds.length === 0) {
    return latest
  }
  const result = await tx.execute<Record<string, unknown>>(sql`
    SELECT DISTINCT ON (d."channelPostId") ${sql.raw(POINT_COLUMNS)}
    FROM "ChannelPostMetricDaily" d
    WHERE d."workspaceId" = ${input.workspaceId}::bigint
      AND d."channelPostId" = ANY(${sql.param(input.channelPostIds)}::bigint[])
      AND d."day" <= ${input.to}::date
    ORDER BY d."channelPostId", d."day" DESC`)
  for (const row of result.rows) {
    latest.set(String(row.channelPostId), mapPoint(row))
  }
  return latest
}

/** The workspace's IANA zone, or null when the workspace does not exist. */
export const findWorkspaceTimezone = async (
  workspaceId: string,
  tx: DatabaseClient = db,
): Promise<string | null> => {
  const result = await tx.execute<{ timezone: string }>(sql`
    SELECT "timezone" FROM "Workspace" WHERE "id" = ${workspaceId}::bigint`)
  return result.rows[0]?.timezone ?? null
}

/** Inbox ids of publish destinations (`destinationIds` filter); TikTok destinations have none. */
export const findInboxIdsOfDestinations = async (
  input: { destinationIds: string[]; workspaceId: string },
  tx: DatabaseClient = db,
): Promise<string[]> => {
  if (input.destinationIds.length === 0) {
    return []
  }
  const result = await tx.execute<{ inboxId: string }>(sql`
    SELECT DISTINCT "inboxId"::text AS "inboxId" FROM "PublishDestination"
    WHERE "workspaceId" = ${input.workspaceId}::bigint
      AND "id" = ANY(${sql.param(input.destinationIds)}::bigint[])
      AND "inboxId" IS NOT NULL`)
  return result.rows.map((row) => row.inboxId)
}

export type SocialPostMetricTarget = {
  channel: string | null
  channelPostId: string | null
  id: string
  inboxName: string | null
  provider: string
  publishDestinationId: string
  removedAt: Date | null
  status: string
}

/**
 * The targets of one composed post with what is needed to find their metrics,
 * or `null` when the post does not exist in the workspace. Bounded by the
 * number of targets of one post.
 */
export const listSocialPostMetricTargets = async (
  input: { socialPostId: string; workspaceId: string },
  tx: DatabaseClient = db,
): Promise<SocialPostMetricTarget[] | null> => {
  const post = await tx.execute<{ id: string }>(sql`
    SELECT "id"::text AS "id" FROM "SocialPost"
    WHERE "id" = ${input.socialPostId}::bigint AND "workspaceId" = ${input.workspaceId}::bigint`)
  if (post.rows.length === 0) {
    return null
  }
  const result = await tx.execute<
    Omit<SocialPostMetricTarget, "removedAt"> & {
      removedAt: string | Date | null
    }
  >(sql`
    SELECT t."id"::text AS "id", t."status"::text AS "status", t."channelPostId"::text AS "channelPostId",
      t."removedAt", t."publishDestinationId"::text AS "publishDestinationId", pd."provider"::text AS "provider",
      i."channel", i."name" AS "inboxName"
    FROM "SocialPostTarget" t
    JOIN "PublishDestination" pd ON pd."id" = t."publishDestinationId"
    LEFT JOIN "Inbox" i ON i."id" = pd."inboxId"
    WHERE t."workspaceId" = ${input.workspaceId}::bigint AND t."socialPostId" = ${input.socialPostId}::bigint
    ORDER BY t."id"
    LIMIT 200`)
  return result.rows.map((row) => ({
    ...row,
    removedAt: row.removedAt ? new Date(row.removedAt) : null,
  }))
}

export type ChannelPostMetricsRow = {
  channel: string
  commentsCount: number
  engagementCount: number
  id: string
  metricsKnownMask: number
  publishedAt: Date | null
  reactionsCount: number
  removedAt: Date | null
  sharesCount: number
  viewsCount: number | null
  viewsKnown: boolean
}

/**
 * The posts of the workspace with the given ids, removed ones included (the
 * callers check `removedAt`). One query for the whole set; ids of other
 * workspaces never match.
 */
export const findChannelPostsForMetrics = async (
  input: { ids: string[]; workspaceId: string },
  tx: DatabaseClient = db,
): Promise<ChannelPostMetricsRow[]> => {
  if (input.ids.length === 0) {
    return []
  }
  const result = await tx.execute<{
    channel: string
    commentsCount: string
    engagementCount: string
    id: string
    metricsKnownMask: number
    reactionsCount: string
    sharesCount: string
    viewsCount: string | null
    publishedAt: string | Date | null
    removedAt: string | Date | null
    viewsKnown: boolean
  }>(sql`
    SELECT "id"::text AS "id", "channel", "metricsKnownMask", "publishedAt", "removedAt",
      "commentsCount", "reactionsCount", "sharesCount", "engagementCount", "viewsCount",
      ("viewsCount" IS NOT NULL) AS "viewsKnown"
    FROM "ChannelPost"
    WHERE "workspaceId" = ${input.workspaceId}::bigint
      AND "id" = ANY(${sql.param(input.ids)}::bigint[])`)
  return result.rows.map((row) => ({
    ...row,
    commentsCount: toNumber(row.commentsCount),
    engagementCount: toNumber(row.engagementCount),
    publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
    reactionsCount: toNumber(row.reactionsCount),
    removedAt: row.removedAt ? new Date(row.removedAt) : null,
    sharesCount: toNumber(row.sharesCount),
    viewsCount: row.viewsCount === null ? null : toNumber(row.viewsCount),
  }))
}

/** One post of the workspace, removed or not (the caller checks `removedAt`). */
export const findChannelPostForMetrics = async (
  input: { id: string; workspaceId: string },
  tx: DatabaseClient = db,
): Promise<ChannelPostMetricsRow | null> => {
  const [row] = await findChannelPostsForMetrics(
    { ids: [input.id], workspaceId: input.workspaceId },
    tx,
  )
  return row ?? null
}

/** Live posts of the scope published (workspace-local day) inside the range. */
export const countPostsPublished = async (
  input: {
    range: PostMetricDayRange
    scope: PostMetricScope
    timezone: string
  },
  tx: DatabaseClient = db,
): Promise<number> => {
  const { range, scope, timezone } = input
  const result = await tx.execute<{ total: string }>(sql`
    SELECT count(*) AS "total" FROM "ChannelPost" cp
    WHERE ${sql.join(
      [
        sql`cp."workspaceId" = ${scope.workspaceId}::bigint`,
        sql`cp."removedAt" IS NULL`,
        sql`cp."publishedAt" IS NOT NULL`,
        sortedWithin(range, timezone),
        ...postFilterConditions(scope),
      ],
      sql` AND `,
    )}`)
  return toNumber(result.rows[0]?.total)
}
