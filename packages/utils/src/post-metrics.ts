/**
 * Vocabulary of the post-metric snapshots (docs/posts.md, "Post analytics"),
 * shared by the database writer and the analytics reads.
 */

/** Which counts a listing ever reported for a post, as the bits of `ChannelPost.metricsKnownMask`. */
export const channelPostMetricBits = {
  comments: 1,
  reactions: 2,
  shares: 4,
  /**
   * Not a metric of its own: set together with `comments` by every write that
   * reports a comments total under the current definition (replies included
   * where a platform counts them). A difference between two comment totals is
   * a real gain only when the previous row already carries it; display and
   * filters keep reading `comments` alone.
   */
  commentsTotalCurrent: 8,
} as const

/** The bits a write sets when it reports a comments total: known, and counted by the current definition. */
export const CHANNEL_POST_COMMENTS_REPORTED_BITS: number =
  channelPostMetricBits.comments + channelPostMetricBits.commentsTotalCurrent

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
