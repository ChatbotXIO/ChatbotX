import type { WhatsappCallStatus } from "@chatbotx.io/database/partials"
import { z } from "zod"

/**
 * FreeSWITCH `variable_hangup_cause` values this plan maps.
 * Any cause outside this set falls through to `"failed"` via
 * {@link resolveTerminalStatus}'s default branch — it never throws, because
 * an unrecognized cause is still a terminated call.
 */
export const hangupCauses = z.enum([
  "NORMAL_CLEARING",
  "NO_ANSWER",
  "ORIGINATOR_CANCEL",
  "ALLOTTED_TIMEOUT",
  "NO_USER_RESPONSE",
  "CALL_REJECTED",
  "USER_BUSY",
])
export type HangupCause = z.infer<typeof hangupCauses>

/**
 * Table-driven cause → status mapping (no if/else chain).
 * `NORMAL_CLEARING` is intentionally NOT a flat entry: whether it means
 * `completed` or `failed` depends on whether the row was ever `accepted` —
 * see {@link resolveTerminalStatus}.
 */
export const HANGUP_CAUSE_TO_STATUS: Record<
  Exclude<HangupCause, "NORMAL_CLEARING">,
  WhatsappCallStatus
> = {
  NO_ANSWER: "failed",
  ORIGINATOR_CANCEL: "failed",
  ALLOTTED_TIMEOUT: "failed",
  NO_USER_RESPONSE: "failed",
  CALL_REJECTED: "rejected",
  USER_BUSY: "rejected",
}

/**
 * Resolves the terminal `WhatsappCallStatus` for a hangup, given the row's
 * status right before the terminating event: `NORMAL_CLEARING`
 * after an `accepted` call is `completed`; `NORMAL_CLEARING` on a call that
 * was never accepted (e.g. the caller hung up while it was still ringing) is
 * `failed`, rendered as "Missed voice call" by the existing
 * userInitiated+failed rule — the enum has no `missed` value. Every other
 * recognized cause maps flatly via {@link HANGUP_CAUSE_TO_STATUS}; an
 * unrecognized cause defaults to `failed`.
 */
export const resolveTerminalStatus = (input: {
  cause: string
  priorStatus: WhatsappCallStatus
}): WhatsappCallStatus => {
  if (input.cause === "NORMAL_CLEARING") {
    return input.priorStatus === "accepted" ? "completed" : "failed"
  }
  const parsed = hangupCauses.safeParse(input.cause)
  if (!parsed.success) {
    return "failed"
  }
  return HANGUP_CAUSE_TO_STATUS[
    parsed.data as Exclude<HangupCause, "NORMAL_CLEARING">
  ]
}

/**
 * SIP final-response codes (`variable_sip_term_status`) mapped to the
 * localized `lastError` i18n key for a failed outbound dial. Kept separate
 * from {@link HANGUP_CAUSE_TO_STATUS} because this only ever supplies error
 * DETAIL — the status itself is always `failed` for these codes.
 */
export const SIP_TERM_STATUS_TO_ERROR: Record<string, string> = {
  "403": "whatsapp.calls.errors.sipForbidden",
  "407": "whatsapp.calls.errors.sipAuthFailed",
  "480": "whatsapp.calls.errors.sipUnavailable",
  "486": "whatsapp.calls.errors.sipBusy",
}
