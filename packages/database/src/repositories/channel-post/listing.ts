import { createId } from "@chatbotx.io/utils"
import {
  POST_CHANNEL_CAPABILITIES,
  type PostManagementChannel,
} from "@chatbotx.io/utils/channel"
import type {
  ChannelPostContentType,
  ChannelPostLiveStatus,
} from "@chatbotx.io/utils/channel-post"
import { CHANNEL_POST_LIVE_STALE_AFTER_MS } from "@chatbotx.io/utils/channel-post"
import {
  CHANNEL_POST_COMMENTS_REPORTED_BITS,
  channelPostMetricBits,
  POST_METRIC_FRESH_POST_HOURS,
  POST_METRIC_WINDOW_DAYS,
} from "@chatbotx.io/utils/post-metrics"
import { isValidTimezone } from "@chatbotx.io/utils/timezone"
import { formatInTimeZone } from "date-fns-tz"
import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNull,
  type SQL,
  sql,
} from "../../client"
import { channelPostModel } from "../../schema"

/**
 * One post as a channel's own listing reports it. A count is `null` when the
 * platform does not report it: unknown, so a sync never overwrites a known
 * count with it.
 */
export type ListedChannelPost = {
  authorExternalId: string | null
  authorName: string | null
  caption: string | null
  commentsCount: number | null
  contentType: ChannelPostContentType | null
  externalPostId: string
  liveStatus: ChannelPostLiveStatus | null
  mediaType: string | null
  permalink: string | null
  publishedAt: Date | null
  reactionsCount: number | null
  sharesCount: number | null
  viewsCount: number | null
}

type ListedPostsTarget = {
  channel: string
  inboxId: string
  integrationId: string
  sourceAccountId: string
  workspaceId: string
}

/** The columns of the `VALUES` rows, in the order `valueRows` writes them. */
const VALUE_COLUMN_NAMES = `"newId", "externalPostId", "caption", "mediaType", "permalink", "publishedAt", "contentType", "liveStatus", "commentsCount", "reactionsCount", "sharesCount", "viewsCount", "authorName", "authorExternalId"`

// Built when a query runs, not when the module loads: a module that only
// imports the repositories (and mocks `sql`) must not execute it.
const valueColumns = (): SQL => sql.raw(VALUE_COLUMN_NAMES)

// Every value is a bound parameter with an explicit cast: a `VALUES` list gives
// PostgreSQL no column types to infer from, and a null needs one. `newId` is the
// id a post gets if it turns out to be new.
const valueRows = (posts: ListedChannelPost[]): SQL =>
  sql.join(
    posts.map(
      (post) =>
        sql`(${createId()}::bigint, ${post.externalPostId}::text, ${post.caption}::text, ${post.mediaType}::text, ${post.permalink}::text, ${post.publishedAt}::timestamptz, ${post.contentType}::"channelPostContentType", ${post.liveStatus}::"channelPostLiveStatus", ${post.commentsCount}::bigint, ${post.reactionsCount}::bigint, ${post.sharesCount}::bigint, ${post.viewsCount}::bigint, ${post.authorName}::text, ${post.authorExternalId}::text)`,
    ),
    sql`, `,
  )

// What a row holds after the update: a value the listing left out keeps its
// stored one, and `engagementCount` is always the sum of the three counts.
// Built when a query runs (see `valueColumns`). The column names are constants,
// never caller input.
const effective = (column: string): SQL =>
  sql.raw(`COALESCE(v."${column}", p."${column}")`)

/**
 * Whether the stored content type outranks what this listing row says. Only the
 * Reels listing knows a Reel (a single post lookup reports the same id as a
 * plain video), and only the live edge, a webhook or a comment ever says `live`
 * (a feed read cannot): a stored `reel` is not turned back into `video`, and a
 * stored `live` is not replaced by whatever the feed calls the post, unless
 * the listing row itself says `live` (the live pass), which may still fill the
 * media type a webhook-made row lacks.
 */
const KEEPS_STORED_TYPE = `((p."contentType" = 'live' AND v."contentType" IS DISTINCT FROM 'live') OR (p."contentType" = 'reel' AND v."contentType" = 'video'))`

/** The content type a row holds after the update. */
const effectiveContentType = (): SQL =>
  sql.raw(
    `CASE WHEN ${KEEPS_STORED_TYPE} THEN p."contentType" ELSE COALESCE(v."contentType", p."contentType") END`,
  )

/** The media type follows the content type decision above. */
const effectiveMediaType = (): SQL =>
  sql.raw(
    `CASE WHEN ${KEEPS_STORED_TYPE} THEN p."mediaType" ELSE COALESCE(v."mediaType", p."mediaType") END`,
  )

/**
 * Whether this listing row's live status may replace the stored one: it must
 * carry one, and be newer than the last observation of it (a webhook or comment
 * seen after the page was read wins). A row with no live status never clears a
 * stored one.
 */
const LIVE_TAKEN = `(v."liveStatus" IS NOT NULL AND (p."liveStatusObservedAt" IS NULL OR p."liveStatusObservedAt" < `

/** The live status a row holds after the update. */
const effectiveLiveStatus = (observedAt: Date): SQL =>
  sql`CASE WHEN ${sql.raw(LIVE_TAKEN)}${observedAt}::timestamptz)) THEN v."liveStatus" ELSE p."liveStatus" END`

/** When the live status a row holds after the update was observed. */
const effectiveLiveObservedAt = (observedAt: Date): SQL =>
  sql`CASE WHEN ${sql.raw(LIVE_TAKEN)}${observedAt}::timestamptz)) THEN ${observedAt}::timestamptz ELSE p."liveStatusObservedAt" END`

/**
 * When the live broadcast a row holds after the update is read again: a window
 * after this listing when the listing says live and takes the status, none when
 * it says ended, unchanged when the listing does not take its status.
 */
const effectiveLiveRecheckAt = (observedAt: Date, recheckAt: Date): SQL =>
  sql`CASE WHEN ${sql.raw(LIVE_TAKEN)}${observedAt}::timestamptz)) THEN (CASE WHEN v."liveStatus" = 'live' THEN ${recheckAt}::timestamptz END) ELSE p."liveRecheckAt" END`

const BIT = channelPostMetricBits

/** Whether an observation at `observedAt` is newer than the stored count observation. */
const fenceAccepts = (observedAt: Date): SQL =>
  sql`(p."metricsFetchedAt" IS NULL OR p."metricsFetchedAt" < ${observedAt}::timestamptz)`

/** The bits of the counts a `VALUES` row reports (a null count is not reported). */
const LISTED_BITS = `((CASE WHEN v."commentsCount" IS NOT NULL THEN ${CHANNEL_POST_COMMENTS_REPORTED_BITS} ELSE 0 END) | (CASE WHEN v."reactionsCount" IS NOT NULL THEN ${BIT.reactions} ELSE 0 END) | (CASE WHEN v."sharesCount" IS NOT NULL THEN ${BIT.shares} ELSE 0 END))`
const listedBits = (): SQL => sql.raw(LISTED_BITS)

/** The same mask as raw text, for the snapshot statement. */
const MASK = `(p."metricsKnownMask" | ${LISTED_BITS})`
const EFFECTIVE = {
  commentsCount: `COALESCE(v."commentsCount", p."commentsCount")`,
  reactionsCount: `COALESCE(v."reactionsCount", p."reactionsCount")`,
  sharesCount: `COALESCE(v."sharesCount", p."sharesCount")`,
  viewsCount: `COALESCE(v."viewsCount", p."viewsCount")`,
} as const

/** The known-mask a stored row has after the listing row is applied. */
const mergedMask = (): SQL => sql.raw(MASK)

/** The metric a stored count's bit stands for, as `CASE` operands. */
type CountMetric = { column: string; requiredBits: number }

/**
 * `requiredBits` are the bits the PREVIOUS row must carry for a difference of
 * this count to be a gain. For a channel whose comments total changed
 * definition (capability `commentTotalRebaseline`) the comments total must also
 * carry the current-definition bit: a row measured before the change is only
 * re-baselined (gain 0) by its first read afterwards. Other channels need the
 * plain comments bit. Decided here from the capability table, never in SQL.
 */
const countMetrics = (channel: string): CountMetric[] => {
  const rebaseline =
    POST_CHANNEL_CAPABILITIES[channel as PostManagementChannel]
      ?.commentTotalRebaseline === true
  return [
    {
      column: "commentsCount",
      requiredBits: rebaseline
        ? CHANNEL_POST_COMMENTS_REPORTED_BITS
        : BIT.comments,
    },
    { column: "reactionsCount", requiredBits: BIT.reactions },
    { column: "sharesCount", requiredBits: BIT.shares },
  ]
}

/**
 * A bare row (composer or comment path, never measured) first listed soon after
 * it was published: its first reported total is that day's gain, like a new
 * post. An older bare row only seeds a baseline.
 */
const bareFreshCondition = (observedAt: Date): SQL =>
  sql`(p."metricsFetchedAt" IS NULL AND COALESCE(v."publishedAt", p."publishedAt") IS NOT NULL AND COALESCE(v."publishedAt", p."publishedAt") >= ${observedAt}::timestamptz - make_interval(hours => ${POST_METRIC_FRESH_POST_HOURS}))`

/**
 * The signed gain of one count: a measured post whose count was already known
 * and is reported again gains the difference; a fresh bare row gains the
 * reported value; any other case (older bare row, newly known, not reported) is
 * 0, never a lifetime total and never a negative number made of an unknown.
 */
const countGain = (
  observedAt: Date,
  { column, requiredBits }: CountMetric,
): SQL =>
  sql`(CASE WHEN p."metricsFetchedAt" IS NOT NULL AND (p."metricsKnownMask" & ${requiredBits}::integer) = ${requiredBits}::integer AND v.${sql.identifier(column)} IS NOT NULL THEN v.${sql.identifier(column)} - p.${sql.identifier(column)} WHEN ${bareFreshCondition(observedAt)} AND v.${sql.identifier(column)} IS NOT NULL THEN v.${sql.identifier(column)} ELSE 0 END)`

const viewsGain = (observedAt: Date): SQL =>
  sql`(CASE WHEN p."metricsFetchedAt" IS NOT NULL AND p."viewsCount" IS NOT NULL AND v."viewsCount" IS NOT NULL THEN v."viewsCount" - p."viewsCount" WHEN ${bareFreshCondition(observedAt)} AND v."viewsCount" IS NOT NULL THEN v."viewsCount" ELSE 0 END)`
const engagementGain = (observedAt: Date, metrics: CountMetric[]): SQL =>
  sql.join(
    metrics.map((metric) => countGain(observedAt, metric)),
    sql` + `,
  )
/** Any count moved (opposite moves of two counts must not cancel out). */
const anyCountMoved = (observedAt: Date, metrics: CountMetric[]): SQL =>
  sql.join(
    metrics.map((metric) => sql`${countGain(observedAt, metric)} <> 0`),
    sql` OR `,
  )

/** A cumulative count in a snapshot: NULL while the platform never reported it. */
const knownCount = (mask: string, bit: number, value: string): string =>
  `(CASE WHEN (${mask} & ${bit}) > 0 THEN ${value} END)`

const DAILY_COLUMNS = `"workspaceId", "day", "channelPostId", "inboxId", "channel", "commentsCount", "reactionsCount", "sharesCount", "engagementCount", "viewsCount", "commentsGain", "reactionsGain", "sharesGain", "engagementGain", "viewsGain", "isBaseline", "observedAt"`

/**
 * Same-day merge of a snapshot row: the cumulative counts follow the latest
 * observation (an unknown one keeps the stored value), the gains add up, the
 * baseline flag of the first observation stays.
 */
const DAILY_CONFLICT = `ON CONFLICT ("workspaceId", "day", "channelPostId") DO UPDATE SET
  "commentsCount" = COALESCE(EXCLUDED."commentsCount", d."commentsCount"),
  "reactionsCount" = COALESCE(EXCLUDED."reactionsCount", d."reactionsCount"),
  "sharesCount" = COALESCE(EXCLUDED."sharesCount", d."sharesCount"),
  "engagementCount" = COALESCE(EXCLUDED."engagementCount", d."engagementCount"),
  "viewsCount" = COALESCE(EXCLUDED."viewsCount", d."viewsCount"),
  "commentsGain" = d."commentsGain" + EXCLUDED."commentsGain",
  "reactionsGain" = d."reactionsGain" + EXCLUDED."reactionsGain",
  "sharesGain" = d."sharesGain" + EXCLUDED."sharesGain",
  "engagementGain" = d."engagementGain" + EXCLUDED."engagementGain",
  "viewsGain" = d."viewsGain" + EXCLUDED."viewsGain",
  "observedAt" = GREATEST(d."observedAt", EXCLUDED."observedAt")`

/** The workspace-local day of the observation, computed in JS from the validated zone. */
const localDay = (observedAt: Date, timezone: string): SQL =>
  sql`${formatInTimeZone(observedAt, timezone, "yyyy-MM-dd")}::date`

const windowStart = (observedAt: Date): SQL =>
  sql`(${observedAt}::timestamptz - make_interval(days => ${POST_METRIC_WINDOW_DAYS}))`

/** Last write wins when a page lists the same post twice (one `VALUES` row per post). */
const dedupePosts = (posts: ListedChannelPost[]): ListedChannelPost[] => [
  ...new Map(posts.map((post) => [post.externalPostId, post])).values(),
]

/** A new post first seen soon after it was published: its first total is that day's gain. */
const freshCondition = (observedAt: Date): SQL =>
  sql`(i."publishedAt" IS NOT NULL AND i."publishedAt" >= ${observedAt}::timestamptz - make_interval(hours => ${POST_METRIC_FRESH_POST_HOURS}))`

const freshGain = (observedAt: Date, column: string, bit: number): SQL =>
  sql`(CASE WHEN ${freshCondition(observedAt)} AND (i."metricsKnownMask" & ${sql.raw(String(bit))}) > 0 THEN i.${sql.identifier(column)} ELSE 0 END)`

/**
 * Writes one page of a channel's listing: inserts the posts the workspace does
 * not have yet and updates the ones whose reported values changed. Never
 * touches the per-post comment switches, `phoneCommentsCount` or `thumbnail`,
 * which the sync does not own. A post the listing shows again is no longer
 * hidden: a listing that contains it is proof it exists, so a wrong "removed"
 * answer heals itself. Three bounded statements per page in one transaction,
 * safe to repeat; an unchanged post is not rewritten.
 *
 * The same statements write the post-metric snapshots (`ChannelPostMetricDaily`)
 * in the same transaction, so a snapshot can never disagree with the stored
 * count: a new post is inserted with its snapshot row in one statement, and the
 * snapshot of an existing post is computed from the locked row just before the
 * update. A page whose observation is not newer than the stored one (a slow
 * unfenced writer overtaken by a newer sync) changes nothing.
 */
export const upsertListedChannelPosts = async (
  input: {
    now: Date
    /** When the platform was read; defaults to `now`. Must be taken BEFORE the read returns to the writer. */
    observedAt?: Date
    posts: ListedChannelPost[]
    target: ListedPostsTarget
    /**
     * `listing` (default): a listing page, which may create posts and updates
     * every reported column. `metricsOnly`: a read of counts for posts that
     * already exist: it creates nothing and writes only the counts, their
     * known mask, the engagement total and `metricsFetchedAt` (advanced on
     * every accepted newer read, changed or not, so it is the observation
     * fence). `metadataFetchedAt`, `removedAt`, the live columns and every
     * description column are left exactly as they are.
     */
    mode?: "listing" | "metricsOnly"
    /** The workspace's IANA zone, which names the day of a snapshot (UTC when absent or unknown). */
    timezone?: string
  },
  tx: DatabaseClient = db,
): Promise<void> => {
  const { now, target } = input
  const metricsOnly = input.mode === "metricsOnly"
  const posts = dedupePosts(input.posts)
  if (posts.length === 0) {
    return
  }
  const observedAt = input.observedAt ?? now
  const recheckAt = new Date(
    observedAt.getTime() + CHANNEL_POST_LIVE_STALE_AFTER_MS,
  )
  const timezone =
    input.timezone && isValidTimezone(input.timezone) ? input.timezone : "UTC"
  const rows = valueRows(posts)
  const day = localDay(observedAt, timezone)
  const metrics = countMetrics(target.channel)

  await tx.transaction(async (client) => {
    if (!metricsOnly) {
      // New posts: a count the listing left out starts at zero (and unknown, see
      // `metricsKnownMask`). Their first snapshot row is written by the same
      // statement from what was inserted; a post first seen soon after it was
      // published counts its first total as that day's gain, an older one only
      // seeds a baseline.
      await client.execute(sql`
      WITH inserted AS (
        INSERT INTO "ChannelPost" (
          "id", "workspaceId", "inboxId", "channel", "integrationId", "sourceAccountId",
          "externalPostId", "caption", "mediaType", "permalink", "publishedAt",
          "contentType", "liveStatus", "liveStatusObservedAt", "liveRecheckAt", "commentsCount", "reactionsCount", "sharesCount",
          "engagementCount", "metricsKnownMask", "viewsCount", "authorName", "authorExternalId",
          "metricsFetchedAt", "metadataFetchedAt"
        )
        SELECT
          v."newId", ${target.workspaceId}::bigint, ${target.inboxId}::bigint, ${target.channel}::text,
          ${target.integrationId}::bigint, ${target.sourceAccountId}::text,
          v."externalPostId", v."caption", v."mediaType", v."permalink", v."publishedAt",
          v."contentType", v."liveStatus",
          CASE WHEN v."liveStatus" IS NOT NULL THEN ${observedAt}::timestamptz END,
          CASE WHEN v."liveStatus" = 'live' THEN ${recheckAt}::timestamptz END,
          COALESCE(v."commentsCount", 0), COALESCE(v."reactionsCount", 0), COALESCE(v."sharesCount", 0),
          COALESCE(v."commentsCount", 0) + COALESCE(v."reactionsCount", 0) + COALESCE(v."sharesCount", 0),
          ${listedBits()},
          v."viewsCount", v."authorName", v."authorExternalId",
          ${observedAt}::timestamptz, ${observedAt}::timestamptz
        FROM (VALUES ${rows}) AS v(${valueColumns()})
        ON CONFLICT ("workspaceId", "channel", "externalPostId") DO NOTHING
        RETURNING "id", "inboxId", "channel", "publishedAt", "commentsCount", "reactionsCount",
          "sharesCount", "engagementCount", "viewsCount", "metricsKnownMask"
      )
      INSERT INTO "ChannelPostMetricDaily" AS d (${sql.raw(DAILY_COLUMNS)})
      SELECT
        ${target.workspaceId}::bigint, ${day}, i."id", i."inboxId", i."channel",
        ${sql.raw(knownCount('i."metricsKnownMask"', BIT.comments, 'i."commentsCount"'))},
        ${sql.raw(knownCount('i."metricsKnownMask"', BIT.reactions, 'i."reactionsCount"'))},
        ${sql.raw(knownCount('i."metricsKnownMask"', BIT.shares, 'i."sharesCount"'))},
        CASE WHEN i."metricsKnownMask" <> 0 THEN i."engagementCount" END,
        i."viewsCount",
        ${freshGain(observedAt, "commentsCount", BIT.comments)},
        ${freshGain(observedAt, "reactionsCount", BIT.reactions)},
        ${freshGain(observedAt, "sharesCount", BIT.shares)},
        ${freshGain(observedAt, "commentsCount", BIT.comments)} + ${freshGain(observedAt, "reactionsCount", BIT.reactions)} + ${freshGain(observedAt, "sharesCount", BIT.shares)},
        (CASE WHEN ${freshCondition(observedAt)} AND i."viewsCount" IS NOT NULL THEN i."viewsCount" ELSE 0 END),
        NOT ${freshCondition(observedAt)},
        ${observedAt}::timestamptz
      FROM inserted i
      WHERE COALESCE(i."publishedAt", ${observedAt}::timestamptz) >= ${windowStart(observedAt)}
        AND (i."metricsKnownMask" <> 0 OR i."viewsCount" IS NOT NULL)
      ${sql.raw(DAILY_CONFLICT)}
    `)
    }

    // Lock the page's existing rows in id order first, the order the bulk
    // update uses, so the two writers cannot deadlock on overlapping posts.
    await client.execute(sql`
      SELECT "id" FROM "ChannelPost"
      WHERE "workspaceId" = ${target.workspaceId}::bigint
        AND "channel" = ${target.channel}::text
        AND "externalPostId" = ANY(${sql.param(posts.map((post) => post.externalPostId))}::text[])
      ORDER BY "id"
      FOR UPDATE
    `)

    // The snapshot of the posts that already existed, from the locked row (the
    // update below has not run yet): gain = reported - stored, per count. A
    // bare row (never measured) and a count that was never known only seed a
    // baseline; a stale observation writes nothing.
    await client.execute(sql`
      INSERT INTO "ChannelPostMetricDaily" AS d (${sql.raw(DAILY_COLUMNS)})
      SELECT
        ${target.workspaceId}::bigint, ${day}, p."id", p."inboxId", p."channel",
        ${sql.raw(knownCount(MASK, BIT.comments, EFFECTIVE.commentsCount))},
        ${sql.raw(knownCount(MASK, BIT.reactions, EFFECTIVE.reactionsCount))},
        ${sql.raw(knownCount(MASK, BIT.shares, EFFECTIVE.sharesCount))},
        CASE WHEN ${sql.raw(MASK)} <> 0 THEN ${sql.raw(`${EFFECTIVE.commentsCount} + ${EFFECTIVE.reactionsCount} + ${EFFECTIVE.sharesCount}`)} END,
        ${sql.raw(EFFECTIVE.viewsCount)},
        ${countGain(observedAt, metrics[0])},
        ${countGain(observedAt, metrics[1])},
        ${countGain(observedAt, metrics[2])},
        ${engagementGain(observedAt, metrics)},
        ${viewsGain(observedAt)},
        (p."metricsFetchedAt" IS NULL AND NOT ${bareFreshCondition(observedAt)}),
        ${observedAt}::timestamptz
      FROM (VALUES ${rows}) AS v(${valueColumns()})
      JOIN "ChannelPost" AS p
        ON p."workspaceId" = ${target.workspaceId}::bigint
        AND p."channel" = ${target.channel}::text
        AND p."externalPostId" = v."externalPostId"
      WHERE (p."metricsFetchedAt" IS NULL OR p."metricsFetchedAt" < ${observedAt}::timestamptz)
        AND COALESCE(v."publishedAt", p."publishedAt", p."createdAt") >= ${windowStart(observedAt)}
        AND (v."commentsCount" IS NOT NULL OR v."reactionsCount" IS NOT NULL OR v."sharesCount" IS NOT NULL OR v."viewsCount" IS NOT NULL)
        AND (
          p."metricsFetchedAt" IS NULL
          OR ${sql.raw(MASK)} <> p."metricsKnownMask"
          OR ${anyCountMoved(observedAt, metrics)}
          OR (v."viewsCount" IS NOT NULL AND p."viewsCount" IS DISTINCT FROM v."viewsCount")
        )
      ORDER BY p."id"
      ${sql.raw(DAILY_CONFLICT)}
    `)

    if (metricsOnly) {
      await client.execute(sql`
        UPDATE "ChannelPost" AS p SET
          "commentsCount" = ${effective("commentsCount")},
          "reactionsCount" = ${effective("reactionsCount")},
          "sharesCount" = ${effective("sharesCount")},
          "engagementCount" = ${effective("commentsCount")} + ${effective("reactionsCount")} + ${effective("sharesCount")},
          "metricsKnownMask" = ${mergedMask()},
          "viewsCount" = ${effective("viewsCount")},
          "metricsFetchedAt" = ${observedAt}::timestamptz,
          "updatedAt" = ${now}::timestamptz
        FROM (VALUES ${rows}) AS v(${valueColumns()})
        WHERE p."workspaceId" = ${target.workspaceId}::bigint
          AND p."channel" = ${target.channel}::text
          AND p."externalPostId" = v."externalPostId"
          AND (p."metricsFetchedAt" IS NULL OR p."metricsFetchedAt" < ${observedAt}::timestamptz)
      `)
      return
    }

    // The count columns, the known mask and `metricsFetchedAt` are fenced by
    // the observation time; the columns only a listing reports are not: a
    // metrics-only read that advanced the fence supplied none of them, so it
    // must not make a listing that started earlier drop them. The live columns
    // keep their own fence (`liveStatusObservedAt`), and a listing that contains
    // a post is proof it exists, so the removal mark is always cleared.
    const fenced = (value: SQL, column: string): SQL =>
      sql`CASE WHEN ${fenceAccepts(observedAt)} THEN ${value} ELSE p.${sql.identifier(column)} END`
    // The description columns are fenced by `metadataFetchedAt`, which only a
    // listing or the first-comment fetch writes (a metrics-only read never
    // does): an older listing landing after a newer one keeps the newer text,
    // and a column that holds nothing yet is always filled.
    const metadataAccepts = sql`(p."metadataFetchedAt" IS NULL OR p."metadataFetchedAt" < ${observedAt}::timestamptz)`
    const described = (value: SQL, column: string): SQL =>
      sql`CASE WHEN ${metadataAccepts} OR p.${sql.identifier(column)} IS NULL THEN ${value} ELSE p.${sql.identifier(column)} END`
    const describedColumns: Record<string, SQL> = {
      authorExternalId: described(
        effective("authorExternalId"),
        "authorExternalId",
      ),
      authorName: described(effective("authorName"), "authorName"),
      caption: described(effective("caption"), "caption"),
      contentType: described(effectiveContentType(), "contentType"),
      mediaType: described(effectiveMediaType(), "mediaType"),
      permalink: described(effective("permalink"), "permalink"),
      publishedAt: described(effective("publishedAt"), "publishedAt"),
    }
    const fencedCounts: Record<string, SQL> = {
      commentsCount: fenced(effective("commentsCount"), "commentsCount"),
      reactionsCount: fenced(effective("reactionsCount"), "reactionsCount"),
      sharesCount: fenced(effective("sharesCount"), "sharesCount"),
      viewsCount: fenced(effective("viewsCount"), "viewsCount"),
      metricsKnownMask: fenced(mergedMask(), "metricsKnownMask"),
    }

    await client.execute(sql`
      UPDATE "ChannelPost" AS p SET
        "caption" = ${describedColumns.caption},
        "mediaType" = ${describedColumns.mediaType},
        "permalink" = ${describedColumns.permalink},
        "publishedAt" = ${describedColumns.publishedAt},
        "contentType" = ${describedColumns.contentType},
        "liveStatus" = ${effectiveLiveStatus(observedAt)},
        "liveStatusObservedAt" = ${effectiveLiveObservedAt(observedAt)},
        "liveRecheckAt" = ${effectiveLiveRecheckAt(observedAt, recheckAt)},
        "commentsCount" = ${fencedCounts.commentsCount},
        "reactionsCount" = ${fencedCounts.reactionsCount},
        "sharesCount" = ${fencedCounts.sharesCount},
        "engagementCount" = ${fenced(sql`${effective("commentsCount")} + ${effective("reactionsCount")} + ${effective("sharesCount")}`, "engagementCount")},
        "metricsKnownMask" = ${fencedCounts.metricsKnownMask},
        "viewsCount" = ${fencedCounts.viewsCount},
        "authorName" = ${describedColumns.authorName},
        "authorExternalId" = ${describedColumns.authorExternalId},
        "metricsFetchedAt" = ${fenced(sql`${observedAt}::timestamptz`, "metricsFetchedAt")},
        "metadataFetchedAt" = GREATEST(COALESCE(p."metadataFetchedAt", ${observedAt}::timestamptz), ${observedAt}::timestamptz),
        "removedAt" = NULL,
        "updatedAt" = ${now}::timestamptz
      FROM (VALUES ${rows}) AS v(${valueColumns()})
      WHERE p."workspaceId" = ${target.workspaceId}::bigint
        AND p."channel" = ${target.channel}::text
        AND p."externalPostId" = v."externalPostId"
        AND (
          p."metricsFetchedAt" IS NULL
          OR p."metadataFetchedAt" IS NULL
          OR p."removedAt" IS NOT NULL
          OR (
            p."caption", p."mediaType", p."permalink", p."publishedAt", p."contentType",
            p."liveStatus", p."liveStatusObservedAt", p."liveRecheckAt", p."commentsCount", p."reactionsCount", p."sharesCount",
            p."viewsCount", p."authorName", p."authorExternalId", p."metricsKnownMask"
          ) IS DISTINCT FROM (
            ${describedColumns.caption}, ${describedColumns.mediaType}, ${describedColumns.permalink}, ${describedColumns.publishedAt}, ${describedColumns.contentType},
            ${effectiveLiveStatus(observedAt)}, ${effectiveLiveObservedAt(observedAt)}, ${effectiveLiveRecheckAt(observedAt, recheckAt)}, ${fencedCounts.commentsCount}, ${fencedCounts.reactionsCount}, ${fencedCounts.sharesCount},
            ${fencedCounts.viewsCount}, ${describedColumns.authorName}, ${describedColumns.authorExternalId}, ${fencedCounts.metricsKnownMask}
          )
        )
    `)
  })
}

/** Posts among `externalPostIds` that still have no re-hosted thumbnail. */
export const findListedPostsWithoutThumbnail = async (
  input: { channel: string; externalPostIds: string[]; workspaceId: string },
  tx: DatabaseClient = db,
): Promise<{ externalPostId: string; id: string }[]> => {
  if (input.externalPostIds.length === 0) {
    return []
  }
  return await tx
    .select({
      externalPostId: channelPostModel.externalPostId,
      id: channelPostModel.id,
    })
    .from(channelPostModel)
    .where(
      and(
        eq(channelPostModel.workspaceId, input.workspaceId),
        eq(channelPostModel.channel, input.channel),
        inArray(channelPostModel.externalPostId, input.externalPostIds),
        isNull(channelPostModel.thumbnail),
      ),
    )
}

/** Stores a re-hosted thumbnail unless the post already has one. */
export const saveListedPostThumbnail = async (
  input: { id: string; thumbnail: string; workspaceId: string },
  tx: DatabaseClient = db,
): Promise<void> => {
  await tx
    .update(channelPostModel)
    .set({ thumbnail: input.thumbnail })
    .where(
      and(
        eq(channelPostModel.id, input.id),
        eq(channelPostModel.workspaceId, input.workspaceId),
        isNull(channelPostModel.thumbnail),
      ),
    )
}
