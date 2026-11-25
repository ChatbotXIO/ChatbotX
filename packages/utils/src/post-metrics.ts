/**
 * Vocabulary of the post-metric snapshots (docs/posts.md, "Post analytics"),
 * shared by the database writer and the analytics reads.
 */

/** Which counts a listing ever reported for a post, as the bits of `ChannelPost.metricsKnownMask`. */
export const channelPostMetricBits = {
  comments: 1,
  reactions: 2,
  shares: 4,
} as const

/** Posts published longer ago than this are not snapshotted. */
export const POST_METRIC_WINDOW_DAYS = 90

/**
 * A post first seen within this many hours of its publication counts its whole
 * first total as the gain of that day; an older post first seen only seeds a
 * baseline (its lifetime total is not one day's gain).
 */
export const POST_METRIC_FRESH_POST_HOURS = 48

/** Months of snapshots kept; older monthly partitions are dropped whole. */
export const POST_METRIC_RETENTION_MONTHS = 25

/** Months of partitions created ahead of the current one. */
export const POST_METRIC_PARTITION_MONTHS_AHEAD = 2

/** The metrics a snapshot tracks. `engagement` is comments + reactions + shares. */
export const postMetricNames = [
  "comments",
  "reactions",
  "shares",
  "engagement",
  "views",
] as const
export type PostMetricName = (typeof postMetricNames)[number]
