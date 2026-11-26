import type {
  SocialPostStatus,
  SocialPostTargetStatus,
} from "@chatbotx.io/database/partials"

export type ComputedPostStatus = {
  /** The post reached a final state: it is stamped `completedAt`. */
  completed: boolean
  status: SocialPostStatus
}

const count = (
  statuses: readonly SocialPostTargetStatus[],
  wanted: SocialPostTargetStatus,
): number => statuses.filter((status) => status === wanted).length

/**
 * The post's state from its targets' states. A target that still waits, runs
 * or needs a person keeps the post `publishing` (a pending target of a post
 * that was never published keeps its draft/scheduled state; a `publishing`
 * post whose remaining targets all wait for a future time is `scheduled`). Only when every
 * target is final does the post become published, partiallyPublished, failed
 * or cancelled.
 */
export const computePostStatus = (
  statuses: readonly SocialPostTargetStatus[],
  current: SocialPostStatus,
  /** A pending target waits for a future time that nothing tried yet. */
  hasWaitingSchedule = false,
): ComputedPostStatus => {
  if (statuses.length === 0) {
    return { completed: false, status: current }
  }
  const running = count(statuses, "publishing") + count(statuses, "processing")
  if (running > 0 || count(statuses, "needsReview") > 0) {
    return { completed: false, status: "publishing" }
  }
  if (count(statuses, "pending") > 0) {
    // Part of the post already went out while another destination still waits
    // for its own time: it is scheduled again, not publishing.
    return {
      completed: false,
      status:
        current === "publishing" && hasWaitingSchedule ? "scheduled" : current,
    }
  }
  const published = count(statuses, "published")
  if (published === statuses.length) {
    return { completed: true, status: "published" }
  }
  if (published > 0) {
    return { completed: true, status: "partiallyPublished" }
  }
  if (count(statuses, "cancelled") === statuses.length) {
    return { completed: true, status: "cancelled" }
  }
  return { completed: true, status: "failed" }
}
