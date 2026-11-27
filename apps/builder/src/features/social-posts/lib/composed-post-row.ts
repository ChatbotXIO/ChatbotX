import type { ComposerPost } from "./composer-state"

type PostTarget = ComposerPost["targets"][number]

/** What a composed post's status badge says in the Posts tab table. */
export type ComposedPostBadge = "draft" | "scheduled" | "failed" | "published"

/** A destination that failed or waits for a person: it can be tried again. */
export const needsRetry = (target: PostTarget): boolean =>
  target.status === "failed" || target.status === "needsReview"

/**
 * One badge per post, by the same rule as the buckets: anything failed (the
 * post, or one of its destinations) is "failed", then the post's own state.
 */
export const composedPostBadge = (post: ComposerPost): ComposedPostBadge => {
  if (
    post.status === "failed" ||
    post.status === "partiallyPublished" ||
    post.targets.some(needsRetry)
  ) {
    return "failed"
  }
  switch (post.status) {
    case "draft":
      return "draft"
    case "published":
      return "published"
    default:
      return "scheduled"
  }
}

/** The time the row shows: the earliest destination time (published, else planned or scheduled), or `null`. */
export const composedPostTime = (post: ComposerPost): Date | null => {
  const times = post.targets.flatMap((target) => {
    const at = target.publishedAt ?? target.scheduledAt
    return at ? [at.getTime()] : []
  })
  return times.length > 0 ? new Date(Math.min(...times)) : null
}
