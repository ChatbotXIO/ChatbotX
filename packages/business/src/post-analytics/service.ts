import {
  channelPostMetricRepository,
  type PostMetricCoverageRow,
  type PostMetricDayRange,
  type PostMetricPointRow,
  type PostMetricScope,
  type TopPostRankBy,
  type TopPostRow,
} from "@chatbotx.io/database/repositories"
import {
  type BestTimesResult,
  computeBestTimes,
} from "@chatbotx.io/utils/post-best-times"
import {
  channelPostMetricBits,
  hasMetricBit,
  type PostMetricName,
  postMetricNames,
} from "@chatbotx.io/utils/post-metrics"
import { isValidTimezone } from "@chatbotx.io/utils/timezone"
import { z } from "zod"
import { BaseService } from "../base.service"
import { notFoundException, validationException } from "../errors"
import {
  addDays,
  daysBetween,
  eachDay,
  isDayString,
  localDay,
  POST_ANALYTICS_DEFAULT_RANGE_DAYS,
  POST_ANALYTICS_MAX_RANGE_DAYS,
} from "./days"

export type PostAnalyticsFilters = {
  channels?: string[]
  contentTypes?: string[]
  /** Publish destinations; resolved to their inboxes (a destination with no inbox matches nothing). */
  destinationIds?: string[]
  /** First local day, `YYYY-MM-DD`; default 29 days before `to`. */
  from?: string
  inboxIds?: string[]
  topicIds?: string[]
  /** Last local day, `YYYY-MM-DD`; default today in the workspace zone. */
  to?: string
  workspaceId: string
}

export type PostAnalyticsCoverageLevel = "none" | "partial" | "full"

export type PostAnalyticsCoverage = {
  byChannel: PostMetricCoverageRow[]
  /** `none`: nothing measured; `partial`: some posts lack history; `full`: every post has history. */
  level: PostAnalyticsCoverageLevel
  /** Live posts of the scope in the snapshot window (the last 90 days). */
  posts: number
  postsMeasured: number
  postsWithHistory: number
  trackingSince: string | null
  /** The scope held more posts than a coverage read looks at. */
  truncated: boolean
}

type Resolved = {
  /** `true` when the filters can match nothing (e.g. destinations without an inbox). */
  empty: boolean
  previous: PostMetricDayRange
  range: PostMetricDayRange
  scope: PostMetricScope
  timezone: string
}

export type PostMetricSummaryItem = {
  /** Whether the platform reported this count for any post in range (unknown is not zero). */
  available: boolean
  /** Percent change against the previous period; null when it cannot be told. */
  changePercent: number | null
  metric: PostMetricName
  previousTotal: number
  total: number
}

export type PostAnalyticsSummary = {
  coverage: PostAnalyticsCoverage
  metrics: PostMetricSummaryItem[]
  postsPublished: number
  previousRange: PostMetricDayRange
  range: PostMetricDayRange
  timezone: string
  /** The current day in the workspace time zone, `YYYY-MM-DD`: what a client clamps its date pickers to. */
  today: string
}

export type PostAnalyticsTimeseriesGroupBy = "none" | "channel" | "inbox"

export type PostAnalyticsTimeseries = {
  available: boolean
  groupBy: PostAnalyticsTimeseriesGroupBy
  metric: PostMetricName
  range: PostMetricDayRange
  series: { key: string; points: { day: string; gain: number }[] }[]
  timezone: string
}

export type PostAnalyticsTopPost = TopPostRow

export type PostAnalyticsTopPosts = {
  items: PostAnalyticsTopPost[]
  metric: PostMetricName
  range: PostMetricDayRange
  rankBy: TopPostRankBy
  timezone: string
}

export type PostAnalyticsBestTimes = BestTimesResult & {
  /** The sample hit its cap: the oldest posts were left out. */
  capped: boolean
}

export type PostMetricValue = {
  available: boolean
  /** Gain over the range; 0 when unavailable. */
  gained: number
  /** Latest known cumulative value in the range, or null. */
  total: number | null
}

export type PostMetricPoint = PostMetricPointRow

export type PostMetricsReport = {
  channelPostId: string
  /** First day the post has a snapshot in the range, or null when it has none. */
  firstSnapshotDay: string | null
  metrics: Record<PostMetricName, PostMetricValue>
  points: PostMetricPoint[]
  range: PostMetricDayRange
  timezone: string
}

export type SocialPostMetricReason =
  | "notPublished"
  | "notLinked"
  | "networkNotSupported"
  | "removed"

export type SocialPostTargetMetrics =
  | {
      available: true
      channel: string | null
      inboxName: string | null
      metrics: PostMetricsReport
      publishDestinationId: string
      targetId: string
    }
  | {
      available: false
      channel: string | null
      inboxName: string | null
      publishDestinationId: string
      reason: SocialPostMetricReason
      targetId: string
    }

/** Only a web address is ever handed out as a link; the platform's value is free text. */
const webAddress = z.url({ protocol: /^https?$/ })
const toWebAddress = (value: string | null): string | null =>
  value !== null && webAddress.safeParse(value).success ? value : null

export type SocialPostMetrics = {
  range: PostMetricDayRange
  socialPostId: string
  targets: SocialPostTargetMetrics[]
  timezone: string
}

/** A post as the report needs it: its identity and what the platform reports now. */
type LinkedPost = Pick<
  NonNullable<
    Awaited<ReturnType<typeof channelPostMetricRepository.findChannelPost>>
  >,
  | "commentsCount"
  | "engagementCount"
  | "id"
  | "metricsKnownMask"
  | "reactionsCount"
  | "sharesCount"
  | "viewsCount"
  | "viewsKnown"
>

const NO_TOTALS = {
  comments: 0,
  engagement: 0,
  reactions: 0,
  shares: 0,
  views: 0,
} satisfies Record<PostMetricName, number>

const percentChange = (current: number, previous: number): number | null =>
  previous > 0
    ? Math.round(((current - previous) / previous) * 1000) / 10
    : null

const coverageLevel = (row: {
  posts: number
  postsMeasured: number
  postsWithHistory: number
}): PostAnalyticsCoverageLevel => {
  if (row.postsMeasured === 0) {
    return "none"
  }
  return row.postsWithHistory >= row.posts ? "full" : "partial"
}

class PostAnalyticsService extends BaseService {
  async summary(input: PostAnalyticsFilters): Promise<PostAnalyticsSummary> {
    const resolved = await this.resolve(input)
    const { empty, previous, range, scope, timezone } = resolved
    const [totals, postsPublished, coverage] = empty
      ? [null, 0, this.emptyCoverage()]
      : await Promise.all([
          channelPostMetricRepository.summarize({
            current: range,
            previous,
            scope,
          }),
          channelPostMetricRepository.countPostsPublished({
            range,
            scope,
            timezone,
          }),
          this.coverage(scope),
        ])
    return {
      coverage,
      metrics: postMetricNames.map((metric) => {
        const total = totals?.current[metric] ?? NO_TOTALS[metric]
        const previousTotal = totals?.previous[metric] ?? NO_TOTALS[metric]
        const available = totals?.available[metric] ?? false
        return {
          available,
          changePercent: available ? percentChange(total, previousTotal) : null,
          metric,
          previousTotal,
          total,
        }
      }),
      postsPublished,
      previousRange: previous,
      range,
      timezone,
      today: localDay(new Date(), timezone),
    }
  }

  async timeseries(
    input: PostAnalyticsFilters & {
      groupBy: PostAnalyticsTimeseriesGroupBy
      metric: PostMetricName
    },
  ): Promise<PostAnalyticsTimeseries> {
    const { empty, range, scope, timezone } = await this.resolve(input)
    const result = empty
      ? { available: false, rows: [] }
      : await channelPostMetricRepository.timeseries({
          groupBy: input.groupBy,
          metric: input.metric,
          range,
          scope,
        })
    const days = eachDay(range.from, range.to)
    const byKey = new Map<string, Map<string, number>>()
    for (const row of result.rows) {
      byKey.set(
        row.groupKey,
        (byKey.get(row.groupKey) ?? new Map()).set(row.day, row.gain),
      )
    }
    const series = [...byKey].map(([key, gains]) => ({
      key,
      points: days.map((day) => ({ day, gain: gains.get(day) ?? 0 })),
    }))
    return {
      available: result.available,
      groupBy: input.groupBy,
      metric: input.metric,
      range,
      series:
        series.length > 0 || input.groupBy !== "none"
          ? series
          : [{ key: "all", points: days.map((day) => ({ day, gain: 0 })) }],
      timezone,
    }
  }

  async topPosts(
    input: PostAnalyticsFilters & {
      limit: number
      metric: PostMetricName
      rankBy: TopPostRankBy
    },
  ): Promise<PostAnalyticsTopPosts> {
    const { empty, range, scope, timezone } = await this.resolve(input)
    const items = empty
      ? []
      : await channelPostMetricRepository.topPosts({
          limit: input.limit,
          metric: input.metric,
          range,
          rankBy: input.rankBy,
          scope,
          timezone,
        })
    return {
      items: items.map((item) => ({
        ...item,
        permalink: toWebAddress(item.permalink),
      })),
      metric: input.metric,
      range,
      rankBy: input.rankBy,
      timezone,
    }
  }

  /** Best posting times of the scope, in the workspace's time zone. */
  async bestTimes(
    input: Omit<PostAnalyticsFilters, "from" | "to">,
  ): Promise<PostAnalyticsBestTimes> {
    const { empty, scope, timezone } = await this.resolve(input)
    const now = new Date()
    const sample = empty
      ? { capped: false, samples: [] }
      : await channelPostMetricRepository.sampleBestTimes({ now, scope })
    return {
      ...computeBestTimes({ posts: sample.samples, timezone }),
      capped: sample.capped,
    }
  }

  /** Daily metrics of one post, or a not-found error when it is not in the workspace. */
  async postMetrics(input: {
    from?: string
    id: string
    to?: string
    workspaceId: string
  }): Promise<PostMetricsReport> {
    const post = await channelPostMetricRepository.findChannelPost({
      id: input.id,
      workspaceId: input.workspaceId,
    })
    if (!post || post.removedAt) {
      throw notFoundException("Post not found.")
    }
    const { range, timezone } = await this.resolve({
      from: input.from,
      to: input.to,
      workspaceId: input.workspaceId,
    })
    return await this.reportFor(post, input.workspaceId, range, timezone)
  }

  /** The metrics of a composed post, per published target. */
  async socialPostMetrics(input: {
    from?: string
    id: string
    to?: string
    workspaceId: string
  }): Promise<SocialPostMetrics> {
    const targets = await channelPostMetricRepository.listSocialPostTargets({
      socialPostId: input.id,
      workspaceId: input.workspaceId,
    })
    if (!targets) {
      throw notFoundException("Post not found.")
    }
    const { range, timezone } = await this.resolve({
      from: input.from,
      to: input.to,
      workspaceId: input.workspaceId,
    })
    const linked = targets.flatMap((target) =>
      target.channelPostId ? [target.channelPostId] : [],
    )
    const [points, latest, posts] = await Promise.all([
      channelPostMetricRepository.listPoints({
        channelPostIds: linked,
        range,
        workspaceId: input.workspaceId,
      }),
      channelPostMetricRepository.findLatestPoints({
        channelPostIds: linked,
        to: range.to,
        workspaceId: input.workspaceId,
      }),
      channelPostMetricRepository.findChannelPosts({
        ids: linked,
        workspaceId: input.workspaceId,
      }),
    ])
    const postById = new Map(posts.map((post) => [post.id, post] as const))
    return {
      range,
      socialPostId: input.id,
      targets: targets.map((target): SocialPostTargetMetrics => {
        const base = {
          channel: target.channel,
          inboxName: target.inboxName,
          publishDestinationId: target.publishDestinationId,
          targetId: target.id,
        }
        const post = target.channelPostId
          ? postById.get(target.channelPostId)
          : undefined
        const reason = this.unavailableReason(target)
        if (reason) {
          return { ...base, available: false, reason }
        }
        if (!target.channelPostId) {
          return { ...base, available: false, reason: "notLinked" }
        }
        // A linked post that was removed from the platform has no metrics to show.
        if (!post || post.removedAt) {
          return { ...base, available: false, reason: "removed" }
        }
        return {
          ...base,
          available: true,
          metrics: buildReport({
            latest: latest.get(target.channelPostId) ?? null,
            points: points.get(target.channelPostId) ?? [],
            post,
            range,
            timezone,
          }),
        }
      }),
      timezone,
    }
  }

  private unavailableReason(target: {
    channelPostId: string | null
    provider: string
    removedAt: Date | null
    status: string
  }): SocialPostMetricReason | null {
    if (target.status !== "published") {
      return "notPublished"
    }
    if (target.removedAt) {
      return "removed"
    }
    if (target.channelPostId) {
      return null
    }
    // Only a destination bound to an inbox has a post list to read metrics from.
    return target.provider === "tiktok" ? "networkNotSupported" : "notLinked"
  }

  private async reportFor(
    post: LinkedPost,
    workspaceId: string,
    range: PostMetricDayRange,
    timezone: string,
  ): Promise<PostMetricsReport> {
    const [points, latest] = await Promise.all([
      channelPostMetricRepository.listPoints({
        channelPostIds: [post.id],
        range,
        workspaceId,
      }),
      channelPostMetricRepository.findLatestPoints({
        channelPostIds: [post.id],
        to: range.to,
        workspaceId,
      }),
    ])
    return buildReport({
      latest: latest.get(post.id) ?? null,
      points: points.get(post.id) ?? [],
      post,
      range,
      timezone,
    })
  }

  private emptyCoverage(): PostAnalyticsCoverage {
    return {
      byChannel: [],
      level: "none",
      posts: 0,
      postsMeasured: 0,
      postsWithHistory: 0,
      trackingSince: null,
      truncated: false,
    }
  }

  private async coverage(
    scope: PostMetricScope,
  ): Promise<PostAnalyticsCoverage> {
    const { rows, truncated } = await channelPostMetricRepository.coverage({
      now: new Date(),
      scope,
    })
    const sum = (pick: (row: PostMetricCoverageRow) => number): number =>
      rows.reduce((total, row) => total + pick(row), 0)
    const totals = {
      posts: sum((row) => row.posts),
      postsMeasured: sum((row) => row.postsMeasured),
      postsWithHistory: sum((row) => row.postsWithHistory),
    }
    const since = rows
      .map((row) => row.trackingSince)
      .filter((day): day is string => day !== null)
      .sort()[0]
    return {
      byChannel: rows,
      level: coverageLevel(totals),
      ...totals,
      trackingSince: since ?? null,
      truncated,
    }
  }

  /** Time zone, day ranges and the inbox filter every read starts from. */
  private async resolve(input: {
    channels?: string[]
    contentTypes?: string[]
    destinationIds?: string[]
    from?: string
    inboxIds?: string[]
    to?: string
    topicIds?: string[]
    workspaceId: string
  }): Promise<Resolved> {
    const stored = await channelPostMetricRepository.findWorkspaceTimezone(
      input.workspaceId,
    )
    const timezone = stored && isValidTimezone(stored) ? stored : "UTC"
    const to = input.to ?? localDay(new Date(), timezone)
    const from =
      input.from ?? addDays(to, 1 - POST_ANALYTICS_DEFAULT_RANGE_DAYS)
    for (const [name, value] of [
      ["from", from],
      ["to", to],
    ] as const) {
      if (!isDayString(value)) {
        throw validationException(name, "Must be a date written YYYY-MM-DD.")
      }
    }
    if (from > to) {
      throw validationException("from", "Must not be after `to`.")
    }
    const length = daysBetween(from, to)
    if (length > POST_ANALYTICS_MAX_RANGE_DAYS) {
      throw validationException(
        "from",
        `The range spans at most ${POST_ANALYTICS_MAX_RANGE_DAYS} days.`,
      )
    }
    const { empty, inboxIds } = await this.resolveInboxes(input)
    return {
      empty,
      previous: { from: addDays(from, -length), to: addDays(from, -1) },
      range: { from, to },
      scope: {
        channels: input.channels,
        contentTypes: input.contentTypes,
        inboxIds,
        topicIds: input.topicIds,
        workspaceId: input.workspaceId,
      },
      timezone,
    }
  }

  private async resolveInboxes(input: {
    destinationIds?: string[]
    inboxIds?: string[]
    workspaceId: string
  }): Promise<{ empty: boolean; inboxIds: string[] | undefined }> {
    if (!input.destinationIds?.length) {
      return { empty: false, inboxIds: input.inboxIds }
    }
    const fromDestinations =
      await channelPostMetricRepository.findInboxIdsOfDestinations({
        destinationIds: input.destinationIds,
        workspaceId: input.workspaceId,
      })
    const inboxIds = input.inboxIds
      ? fromDestinations.filter((id) => input.inboxIds?.includes(id))
      : fromDestinations
    return { empty: inboxIds.length === 0, inboxIds }
  }
}

function metricKnown(post: LinkedPost, name: PostMetricName): boolean {
  switch (name) {
    case "comments":
      return hasMetricBit(post.metricsKnownMask, channelPostMetricBits.comments)
    case "reactions":
      return hasMetricBit(
        post.metricsKnownMask,
        channelPostMetricBits.reactions,
      )
    case "shares":
      return hasMetricBit(post.metricsKnownMask, channelPostMetricBits.shares)
    case "engagement":
      return post.metricsKnownMask !== 0
    case "views":
      return post.viewsKnown
    default: {
      const exhaustive: never = name
      return exhaustive
    }
  }
}

const currentCount = (
  post: LinkedPost,
  name: PostMetricName,
): number | null => {
  if (!metricKnown(post, name)) {
    return null
  }
  const value: Record<PostMetricName, number | null> = {
    comments: post.commentsCount,
    engagement: post.engagementCount,
    reactions: post.reactionsCount,
    shares: post.sharesCount,
    views: post.viewsCount,
  }
  return value[name]
}

function buildReport(input: {
  /** Latest snapshot on or before the range end (not bounded by its start). */
  latest: PostMetricPointRow | null
  points: PostMetricPointRow[]
  post: LinkedPost
  range: PostMetricDayRange
  timezone: string
}): PostMetricsReport {
  const { latest, points, post } = input
  const metric = (name: PostMetricName): PostMetricValue => {
    // Availability is the post's, not the snapshots': a quiet window has no
    // snapshot but the platform still reports the count (0 gained, not unknown).
    const available = metricKnown(post, name)
    const snapshotTotal = latest?.[name].total ?? null
    return {
      available,
      gained: points.reduce((sum, point) => sum + point[name].gain, 0),
      total: available ? (snapshotTotal ?? currentCount(post, name)) : null,
    }
  }
  return {
    channelPostId: post.id,
    firstSnapshotDay: points[0]?.day ?? null,
    metrics: {
      comments: metric("comments"),
      engagement: metric("engagement"),
      reactions: metric("reactions"),
      shares: metric("shares"),
      views: metric("views"),
    },
    points,
    range: input.range,
    timezone: input.timezone,
  }
}

export const postAnalyticsService = new PostAnalyticsService()
