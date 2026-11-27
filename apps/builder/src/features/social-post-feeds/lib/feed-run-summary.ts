import type { SocialPostFeedRunSummary } from "@chatbotx.io/database/partials"

/** The message keys of the last-check line, written out in full so each is checked against the messages. */
export const FEED_RUN_MESSAGES = {
  created: "posts.feeds.lastRun.created",
  dailyCap: "posts.feeds.lastRun.dailyCap",
  dailyCapUntil: "posts.feeds.lastRun.dailyCapUntil",
  noNew: "posts.feeds.lastRun.noNew",
  notModified: "posts.feeds.lastRun.notModified",
  refused: "posts.feeds.lastRun.refused",
  skippedOnly: "posts.feeds.lastRun.skippedOnly",
  stale: "posts.feeds.lastRun.stale",
  waiting: "posts.feeds.lastRun.waiting",
} as const

export type FeedRunLine = {
  /** `dailyCap` only: the rolling 24 h cap. */
  cap?: number
  count?: number
  key: keyof typeof FEED_RUN_MESSAGES
  /** `dailyCap` only: when a place frees up (ISO 8601), if known. */
  until?: string
}

const waitingLine = (
  summary: SocialPostFeedRunSummary,
  now: number,
): FeedRunLine => {
  if (summary.waitingReason === "dailyCap" && summary.dailyCap !== undefined) {
    return {
      cap: summary.dailyCap,
      count: summary.waiting,
      key: "dailyCap",
      // A time already past would only mislead: the next check takes the items.
      ...(summary.nextSlotAt && Date.parse(summary.nextSlotAt) > now
        ? { until: summary.nextSlotAt }
        : {}),
    }
  }
  return { count: summary.waiting, key: "waiting" }
}

/** What to say about a feed's last check: one or more short lines, none when there is nothing to add (never checked, or it failed: the error is shown separately). */
export const feedRunLines = (
  summary: SocialPostFeedRunSummary | null,
  now: number = Date.now(),
): FeedRunLine[] => {
  if (!summary) {
    return []
  }
  if (summary.kind === "stale") {
    return [{ key: "stale" }]
  }
  if (summary.kind === "notModified") {
    return [{ key: "notModified" }]
  }
  if (summary.kind !== "checked") {
    return []
  }
  if (summary.fresh === 0) {
    return [{ key: "noNew" }]
  }
  const lines: FeedRunLine[] = []
  if (summary.created > 0) {
    lines.push({ count: summary.created, key: "created" })
  }
  if (summary.refused > 0) {
    lines.push({ count: summary.refused, key: "refused" })
  }
  if (summary.waiting > 0) {
    lines.push(waitingLine(summary, now))
  }
  return lines.length > 0 ? lines : [{ key: "skippedOnly" }]
}
