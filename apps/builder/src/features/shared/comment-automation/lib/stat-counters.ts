import type { CommentAutomationEventType } from "@chatbotx.io/analytics/schemas"

/**
 * Which lifetime counter on the automation row backs each column. The counters
 * live on `CommentAutomation` rather than being aggregated from
 * `CommentAutomationEvent`, which a nightly cron purges after 30 days — so
 * unlike `BroadcastStatsCell` this needs no fetch and no store at all: the
 * numbers arrive with the row.
 *
 * Plain module (not `"use client"`) so the public contacts endpoint can read
 * the same mapping server-side.
 */
export const commentAutomationStatCounters = {
  "message:sent": "sentCount",
  "message:delivered": "deliveredCount",
  "message:seen": "seenCount",
  "flow:clicked": "clickedCount",
  "message:failed": "failedCount",
  "comment:missed": "missedCount",
} as const satisfies Partial<Record<CommentAutomationEventType, string>>

export type CommentAutomationStatField =
  keyof typeof commentAutomationStatCounters
