import type { WhatsappConnectOutcome } from "../schema"

/** A connected outcome that still needs Meta OTP verification before it can register. */
export function whatsappNeedsVerification(
  outcome: WhatsappConnectOutcome,
): boolean {
  return (
    outcome.status === "connected" &&
    outcome.extra?.requiresPhoneVerification === true
  )
}

/** A connected outcome from the manual-connect path — has webhook/QR info to show. */
export function whatsappHasManualResult(
  outcome: WhatsappConnectOutcome,
): boolean {
  return outcome.status === "connected" && outcome.extra?.manual != null
}

/**
 * The full post-connect sequence a WhatsApp number can go through (plan
 * §3.4). "coexist" is a sentinel starting point only — it is never owned by
 * the stage machinery in this feature: the top-level form's manual/
 * auto-select path delegates it to `CoexistPopup`, and every picker path
 * (single or batch) runs it per row from the picker's own switch, through
 * `useConnectFlow`/`useConnectBatch`. Both the single-item hook (`hooks/use-whatsapp-connect-stages.ts`)
 * and the dialog's extra steps (`components/whatsapp-connect-extra-steps.tsx`)
 * only ever evaluate "verification" and "manualResult" from this order, so
 * neither can drift on which stage a given outcome needs.
 */
export const WHATSAPP_CONNECT_STAGE_ORDER = [
  "coexist",
  "verification",
  "manualResult",
] as const
export type WhatsappConnectStage = (typeof WHATSAPP_CONNECT_STAGE_ORDER)[number]

/** The next stage after `from` that `outcome` actually needs, or `null` once nothing remains. */
export function nextWhatsappConnectStage(
  from: WhatsappConnectStage,
  outcome: WhatsappConnectOutcome,
): WhatsappConnectStage | null {
  const startIndex = WHATSAPP_CONNECT_STAGE_ORDER.indexOf(from) + 1
  for (
    let index = startIndex;
    index < WHATSAPP_CONNECT_STAGE_ORDER.length;
    index++
  ) {
    const candidate = WHATSAPP_CONNECT_STAGE_ORDER[index]
    if (candidate === "verification" && whatsappNeedsVerification(outcome)) {
      return candidate
    }
    if (candidate === "manualResult" && whatsappHasManualResult(outcome)) {
      return candidate
    }
  }
  return null
}
