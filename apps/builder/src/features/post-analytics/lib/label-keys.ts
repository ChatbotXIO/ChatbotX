import type {
  PostAnalyticsGroupByValue,
  PostAnalyticsRankByValue,
  PostMetricNameValue,
} from "../schema"

/** Translation keys (under `posts.analytics`) per enum value, so every key stays searchable. */
export const METRIC_LABEL_KEYS = {
  comments: "metrics.comments",
  engagement: "metrics.engagement",
  reactions: "metrics.reactions",
  shares: "metrics.shares",
  views: "metrics.views",
} as const satisfies Record<PostMetricNameValue, string>

/** Lowercase forms for use inside a sentence (a language-specific noun, never runtime lower-cased). */
export const METRIC_LOWER_LABEL_KEYS = {
  comments: "metricsLower.comments",
  engagement: "metricsLower.engagement",
  reactions: "metricsLower.reactions",
  shares: "metricsLower.shares",
  views: "metricsLower.views",
} as const satisfies Record<PostMetricNameValue, string>

export const GROUP_LABEL_KEYS = {
  channel: "chart.group.channel",
  inbox: "chart.group.inbox",
  none: "chart.group.none",
} as const satisfies Record<PostAnalyticsGroupByValue, string>

export const BREAKDOWN_LABEL_KEYS = {
  channel: "breakdown.by.channel",
  inbox: "breakdown.by.inbox",
} as const satisfies Record<Exclude<PostAnalyticsGroupByValue, "none">, string>

export const RANK_LABEL_KEYS = {
  gained: "topPosts.rank_gained",
  total: "topPosts.rank_total",
} as const satisfies Record<PostAnalyticsRankByValue, string>
