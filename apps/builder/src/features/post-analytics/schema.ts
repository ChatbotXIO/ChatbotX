import {
  channelPostContentTypes,
  channelTypes,
} from "@chatbotx.io/database/partials"
import { zodBigintIdAsString } from "@chatbotx.io/utils"
import {
  bestTimeSlot,
  bestTimesStatuses,
} from "@chatbotx.io/utils/post-best-times"
import { postMetricNames } from "@chatbotx.io/utils/post-metrics"
import { z } from "zod"
import { channelPostId } from "@/features/channel-posts/schema"
import { postTopicId } from "@/features/post-topics/schema"
import { socialPostIdRequest } from "@/features/social-posts/schema"

const MAX_FILTER_VALUES = 200
const MAX_TOPIC_FILTER_VALUES = 20
const MAX_TOP_POSTS = 50

/**
 * OpenAPI query parsing keeps a single `?channels=messenger` as a string and
 * only builds an array for repeated or indexed keys, so wrap a lone value.
 */
const queryArray = <Item extends z.ZodType>(item: Item, max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? [value] : value),
    z.array(item).max(max),
  )

/** A workspace-local calendar day, `YYYY-MM-DD`. */
export const postAnalyticsDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a date written YYYY-MM-DD")

export const postMetricName = z.enum(postMetricNames)
export type PostMetricNameValue = z.infer<typeof postMetricName>

export const postAnalyticsGroupBy = z.enum(["none", "channel", "inbox"])
export type PostAnalyticsGroupByValue = z.infer<typeof postAnalyticsGroupBy>

export const postAnalyticsRankBy = z.enum(["gained", "total"])
export type PostAnalyticsRankByValue = z.infer<typeof postAnalyticsRankBy>

/** The scope shared by every analytics read. */
const scopeFields = {
  channels: queryArray(channelTypes, channelTypes.options.length)
    .optional()
    .describe("Only posts on these channels. Omit for all channels."),
  contentTypes: queryArray(channelPostContentTypes, MAX_FILTER_VALUES)
    .optional()
    .describe("Only posts of these content types. Omit for all."),
  destinationIds: queryArray(zodBigintIdAsString(), MAX_FILTER_VALUES)
    .optional()
    .describe(
      "Only posts of these publish destinations (`publishDestinations.list`); each is read through its inbox, and a destination without an inbox matches nothing.",
    ),
  inboxIds: queryArray(zodBigintIdAsString(), MAX_FILTER_VALUES)
    .optional()
    .describe(
      "Only posts of these inboxes (`inboxes.list`). Omit for all inboxes.",
    ),
  topicIds: queryArray(postTopicId, MAX_TOPIC_FILTER_VALUES)
    .optional()
    .describe("Only posts that carry one of these topics (`postTopics.list`)."),
}

const rangeFields = {
  from: postAnalyticsDay
    .optional()
    .describe(
      "First local day (workspace time zone), `YYYY-MM-DD`. Default: 29 days before `to`. The range spans at most 366 days.",
    ),
  to: postAnalyticsDay
    .optional()
    .describe(
      "Last local day, `YYYY-MM-DD`. Default: today in the workspace time zone.",
    ),
}

// Strict, like the social-post request schemas: a wrong key (`channel` for
// `channels`) is a 400, never a silently unfiltered read.
export const postAnalyticsRangeRequest = z.object(rangeFields).strict()

export const postAnalyticsFiltersRequest = z
  .object({
    ...scopeFields,
    ...rangeFields,
  })
  .strict()

export const postAnalyticsBestTimesRequest = z.object(scopeFields).strict()

export const postAnalyticsTimeseriesRequest = postAnalyticsFiltersRequest
  .extend({
    groupBy: postAnalyticsGroupBy
      .default("none")
      .describe(
        "Split the series per `channel` or per `inbox` (the 50 largest); default `none`.",
      ),
    metric: postMetricName
      .default("engagement")
      .describe(
        "The count to chart; `engagement` is comments + reactions + shares.",
      ),
  })
  .strict()

export const postAnalyticsTopPostsRequest = postAnalyticsFiltersRequest
  .extend({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_TOP_POSTS)
      .default(10)
      .describe("Posts to return (1-50, default 10)."),
    metric: postMetricName
      .default("engagement")
      .describe("The count to rank by."),
    rankBy: postAnalyticsRankBy
      .default("gained")
      .describe(
        "`gained`: most gained in the range (from our daily snapshots); `total`: highest current total among posts published in the range.",
      ),
  })
  .strict()

export const postMetricsRequest = postAnalyticsRangeRequest
  .extend({
    id: channelPostId.describe("Post id from `channelPostManagement.list`."),
  })
  .strict()

export const socialPostMetricsRequest = socialPostIdRequest
  .extend(rangeFields)
  .strict()

export const postAnalyticsDayRange = z.object({
  from: postAnalyticsDay,
  to: postAnalyticsDay,
})

const coverageChannel = z.object({
  channel: z.string(),
  posts: z.number().int(),
  postsMeasured: z.number().int(),
  postsWithHistory: z.number().int(),
  trackingSince: postAnalyticsDay.nullable(),
})

/**
 * How much of the scope the daily snapshots really cover, so an empty or
 * partial chart is never read as "no activity": a post is `measured` once we
 * saw it, and has `history` once we saw it change or twice. The window is the
 * posts of the last 90 days; we only measure from when the workspace's
 * channels were first synced (`trackingSince`).
 */
export const postAnalyticsCoverage = z.object({
  byChannel: z.array(coverageChannel),
  level: z.enum(["none", "partial", "full"]),
  posts: z.number().int(),
  postsMeasured: z.number().int(),
  postsWithHistory: z.number().int(),
  trackingSince: postAnalyticsDay.nullable(),
  truncated: z.boolean(),
})

export const postAnalyticsSummaryResponse = z.object({
  coverage: postAnalyticsCoverage,
  metrics: z.array(
    z.object({
      available: z
        .boolean()
        .describe(
          "False when the platform never reported this count: the totals are not zeros.",
        ),
      changePercent: z
        .number()
        .nullable()
        .describe(
          "Change against the previous period of the same length; null when it cannot be told.",
        ),
      metric: postMetricName,
      previousTotal: z.number(),
      total: z
        .number()
        .describe(
          "Gained over the range (a sum of daily gains, may be negative).",
        ),
    }),
  ),
  postsPublished: z.number().int(),
  previousRange: postAnalyticsDayRange,
  range: postAnalyticsDayRange,
  timezone: z.string(),
  today: postAnalyticsDay.describe(
    "The current day in the workspace time zone: what a client clamps its date pickers to.",
  ),
})

export const postAnalyticsTimeseriesResponse = z.object({
  available: z.boolean(),
  groupBy: postAnalyticsGroupBy,
  metric: postMetricName,
  range: postAnalyticsDayRange,
  series: z.array(
    z.object({
      key: z
        .string()
        .describe("`all`, a channel, or an inbox id, by `groupBy`."),
      points: z.array(z.object({ day: postAnalyticsDay, gain: z.number() })),
    }),
  ),
  timezone: z.string(),
})

export const postAnalyticsTopPost = z.object({
  caption: z.string().nullable(),
  channel: z.string(),
  channelPostId: z.string(),
  contentType: z.string().nullable(),
  gained: z.number(),
  inboxId: z.string(),
  inboxName: z.string(),
  // Only a web address is ever linked to: another scheme (javascript:, data:) is refused at the API boundary.
  permalink: z.url({ protocol: /^https?$/ }).nullable(),
  publishedAt: z.date().nullable(),
  thumbnail: z.string().nullable(),
  total: z.number(),
})

export const postAnalyticsTopPostsResponse = z.object({
  items: z.array(postAnalyticsTopPost),
  metric: postMetricName,
  range: postAnalyticsDayRange,
  rankBy: postAnalyticsRankBy,
  timezone: z.string(),
})

export const postAnalyticsBestTimesResponse = z.object({
  capped: z.boolean(),
  slots: z
    .array(bestTimeSlot)
    .describe(
      "Every weekday/hour slot with at least one post (the heatmap); weekday 1 = Monday.",
    ),
  status: bestTimesStatuses,
  timezone: z.string(),
  top: z.array(bestTimeSlot),
  totalPosts: z.number().int(),
})

const metricCell = z.object({ gain: z.number(), total: z.number().nullable() })

export const postMetricPoint = z.object({
  comments: metricCell,
  day: postAnalyticsDay,
  engagement: metricCell,
  isBaseline: z.boolean(),
  reactions: metricCell,
  shares: metricCell,
  views: metricCell,
})

const postMetricValue = z.object({
  available: z.boolean(),
  gained: z.number(),
  total: z.number().nullable(),
})

export const postMetricsResponse = z.object({
  channelPostId: z.string(),
  firstSnapshotDay: postAnalyticsDay.nullable(),
  metrics: z.object({
    comments: postMetricValue,
    engagement: postMetricValue,
    reactions: postMetricValue,
    shares: postMetricValue,
    views: postMetricValue,
  }),
  points: z.array(postMetricPoint),
  range: postAnalyticsDayRange,
  timezone: z.string(),
})

export const socialPostMetricReasons = z.enum([
  "notPublished",
  "notLinked",
  "networkNotSupported",
  "removed",
])

const targetBase = {
  channel: z.string().nullable(),
  inboxName: z.string().nullable(),
  publishDestinationId: z.string(),
  targetId: z.string(),
}

export const socialPostMetricsResponse = z.object({
  range: postAnalyticsDayRange,
  socialPostId: z.string(),
  targets: z.array(
    z.discriminatedUnion("available", [
      z.object({
        ...targetBase,
        available: z.literal(true),
        metrics: postMetricsResponse,
      }),
      z.object({
        ...targetBase,
        available: z.literal(false),
        reason: socialPostMetricReasons,
      }),
    ]),
  ),
  timezone: z.string(),
})

export type PostAnalyticsSummaryResponse = z.infer<
  typeof postAnalyticsSummaryResponse
>
export type PostAnalyticsTimeseriesResponse = z.infer<
  typeof postAnalyticsTimeseriesResponse
>
export type PostAnalyticsTopPostsResponse = z.infer<
  typeof postAnalyticsTopPostsResponse
>
export type PostAnalyticsBestTimesResponse = z.infer<
  typeof postAnalyticsBestTimesResponse
>
export type SocialPostMetricReason = z.infer<typeof socialPostMetricReasons>
export type PostMetricsResponse = z.infer<typeof postMetricsResponse>
export type PostAnalyticsCoverageResponse = z.infer<
  typeof postAnalyticsCoverage
>
