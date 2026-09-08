import type { MessageKey } from "./message-key"

/**
 * Failure reasons the WhatsApp coexist route's `smb_app_data` trigger can
 * return (`integrations/whatsapp/src/api/coexists.ts`'s `SmbAppDataResult`)
 * plus the generic "trigger_failed" the business `setCoexist` service
 * returns for a thrown provider error. Carried over from the old
 * `CoexistPopup`'s `REASON_TO_KEY` table so per-row failure feedback keeps
 * the same copy after the popup's rewrite into `CoexistStep`.
 */
export const COEXIST_KNOWN_REASONS = [
  "already_triggered",
  "window_expired",
  "not_eligible",
  "trigger_failed",
] as const
export type CoexistKnownReason = (typeof COEXIST_KNOWN_REASONS)[number]

export const COEXIST_REASON_MESSAGE_KEYS: Record<
  CoexistKnownReason,
  MessageKey
> = {
  already_triggered: "coexist.errors.alreadyTriggered",
  window_expired: "coexist.errors.windowExpired",
  not_eligible: "coexist.errors.notEligible",
  trigger_failed: "coexist.errors.triggerFailed",
}

export function isCoexistKnownReason(
  reason: string,
): reason is CoexistKnownReason {
  return (COEXIST_KNOWN_REASONS as readonly string[]).includes(reason)
}
