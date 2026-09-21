import {
  type BroadcastSendLimit,
  broadcastSendLimitIssues,
} from "@chatbotx.io/database/partials"

export type BroadcastSendLimitIssue = keyof typeof broadcastSendLimitIssues

/**
 * Cross-field zod issue code → i18n key, mirroring the call-hours precedent
 * (`whatsapp-call-hours-section.tsx`'s `ISSUE_LABEL_KEY`). The values already
 * equal the zod `.refine` messages in `broadcastSendLimitIssues`; the map
 * exists so the two can diverge later without touching call sites.
 */
export const SEND_LIMIT_ISSUE_LABEL_KEY: Record<
  BroadcastSendLimitIssue,
  string
> = {
  rangeEndBeforeStart: broadcastSendLimitIssues.rangeEndBeforeStart,
}

/**
 * The i18n key for a `formState.errors.audienceRange?.message`, or
 * `undefined` when the message isn't one of the known send-limit issues (or
 * there is no error at all).
 */
export const resolveSendLimitIssueKey = (
  message: unknown,
): string | undefined => {
  const issue = (
    Object.keys(broadcastSendLimitIssues) as BroadcastSendLimitIssue[]
  ).find((key) => broadcastSendLimitIssues[key] === message)
  return issue ? SEND_LIMIT_ISSUE_LABEL_KEY[issue] : undefined
}

type SendLimitFields = Pick<
  BroadcastSendLimit,
  "audienceRangeStart" | "audienceRangeEnd" | "sendRatePerMinute"
>

/**
 * Formats a stored send limit for the detail dialog, e.g.
 * `"Contacts #1 – #20000 · 100 messages / minute"`. `null` when the
 * broadcast carries no limit at all, so the caller renders no row.
 */
export const describeBroadcastSendLimit = (
  broadcast: SendLimitFields,
  t: (key: string, params?: Record<string, string | number | Date>) => string,
): string | null => {
  const { audienceRangeStart, audienceRangeEnd, sendRatePerMinute } = broadcast
  const parts: string[] = []

  if (audienceRangeStart != null || audienceRangeEnd != null) {
    parts.push(
      t("broadcasts.sendLimit.rangeSummary", {
        start: audienceRangeStart ?? 1,
        end: audienceRangeEnd ?? "∞",
      }),
    )
  }

  if (sendRatePerMinute != null) {
    parts.push(
      t("broadcasts.sendLimit.rateSummary", { rate: sendRatePerMinute }),
    )
  }

  return parts.length > 0 ? parts.join(" · ") : null
}
