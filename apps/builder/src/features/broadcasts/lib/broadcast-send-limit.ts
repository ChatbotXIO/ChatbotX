import {
  BROADCAST_AUDIENCE_POSITION_MIN,
  type BroadcastAudienceRangeInput,
  type BroadcastSendLimit,
  broadcastSendLimitIssues,
  clampAudienceCountToRange,
  resolveBroadcastAudienceRange,
} from "@chatbotx.io/database/partials"

export type BroadcastSendLimitIssue = keyof typeof broadcastSendLimitIssues

/**
 * Cross-field zod issue code → i18n key, mirroring the call-hours precedent
 * (`whatsapp-call-hours-section.tsx`'s `ISSUE_LABEL_KEY`). `broadcastSendLimitIssues`'s
 * values are stable issue CODES (e.g. `"broadcastSendLimit.rangeEndBeforeStart"`),
 * not translation keys — the real key lives under the `broadcasts.sendLimit.*`
 * namespace like every other string in this component, so the two must be
 * mapped explicitly rather than reused as-is.
 */
export const SEND_LIMIT_ISSUE_LABEL_KEY: Record<
  BroadcastSendLimitIssue,
  string
> = {
  rangeEndBeforeStart: "broadcasts.sendLimit.rangeEndBeforeStart",
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

/**
 * The receivers count shown in the form: the fetched (unwindowed) total
 * clamped to the range currently typed into the two range fields. Never
 * triggers a new count request — the form's `count` state is unaffected by
 * the range fields, only this derivation is.
 */
export const resolveWindowedReceiversCount = (
  total: number,
  range: BroadcastAudienceRangeInput,
): number =>
  clampAudienceCountToRange(total, resolveBroadcastAudienceRange(range))

type SendLimitFields = Pick<
  BroadcastSendLimit,
  "audienceRangeStart" | "audienceRangeEnd" | "sendRatePerMinute"
>

/** Formats the always-visible audience window shown in broadcast details. */
export const describeBroadcastAudienceRange = (
  broadcast: SendLimitFields,
  t: (key: string, params?: Record<string, string | number | Date>) => string,
): string => {
  const { audienceRangeStart, audienceRangeEnd } = broadcast

  if (audienceRangeStart != null && audienceRangeEnd != null) {
    return t("broadcasts.sendLimit.rangeSummary", {
      start: audienceRangeStart,
      end: audienceRangeEnd,
    })
  }
  if (audienceRangeStart != null) {
    return t("broadcasts.sendLimit.rangeFromSummary", {
      start: audienceRangeStart,
    })
  }
  if (audienceRangeEnd != null) {
    return t("broadcasts.sendLimit.rangeSummary", {
      start: BROADCAST_AUDIENCE_POSITION_MIN,
      end: audienceRangeEnd,
    })
  }
  return t("broadcasts.sendLimit.allPlaceholder")
}
