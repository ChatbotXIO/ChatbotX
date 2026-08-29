import type { z } from "zod"
import { flowValidationCodes } from "../validation-codes"
import type { WaTemplateParams } from "./send-wa-message-template"

/**
 * Pure LTO (limited-time offer) helpers shared by the builder's date-time
 * picker and its preview badge. The schema keeps storing
 * `expiration_time_ms` exactly as before (a plain epoch-milliseconds
 * number) — these only convert between that number and a `Date` the picker
 * UI can render, so legacy saved flows/broadcasts parse and send unchanged.
 */

/**
 * Whether a stored expiration was actually configured. `extractTemplateParams`
 * seeds new LTO params with `0`, so zero (and anything non-positive or
 * non-finite) means "not picked yet" — never a real send value.
 */
export function isConfiguredExpirationTimeMs(
  expirationTimeMs: number | undefined,
): expirationTimeMs is number {
  return (
    typeof expirationTimeMs === "number" &&
    Number.isFinite(expirationTimeMs) &&
    expirationTimeMs > 0
  )
}

/** Unconfigured values render as "no date picked" rather than the 1970 epoch. */
export function expirationTimeMsToDate(
  expirationTimeMs: number | undefined,
): Date | undefined {
  return isConfiguredExpirationTimeMs(expirationTimeMs)
    ? new Date(expirationTimeMs)
    : undefined
}

export function dateToExpirationTimeMs(date: Date): number {
  return date.getTime()
}

/**
 * Whether a stored expiration is still ahead of `now`. Used as a soft signal
 * (the picker calendar already disables past dates, and the preview badge
 * flags an already-expired offer) rather than a hard schema gate — a hard
 * gate on `waTemplateParamsSchema` itself would block re-parsing/re-sending
 * an older LTO template whose fixed expiration has since passed, which is
 * Meta's call to reject, not ours to block during unrelated processing.
 */
export function isFutureExpirationTimeMs(
  expirationTimeMs: number | undefined,
  now: Date = new Date(),
): boolean {
  return (
    typeof expirationTimeMs === "number" && expirationTimeMs > now.getTime()
  )
}

/**
 * A template with a limited-time offer must have a picked expiration before
 * publish/broadcast — the seeded `0` would otherwise reach Meta as the 1970
 * epoch. Values in the past stay valid on purpose: legacy saved offers with a
 * fixed expiration must keep re-parsing and re-sending unchanged.
 */
export function validateLimitedTimeOfferParams(
  params: WaTemplateParams,
  ctx: z.RefinementCtx,
  basePath: (string | number)[] = [],
): void {
  if (!params.limited_time_offer) {
    return
  }
  if (
    !isConfiguredExpirationTimeMs(params.limited_time_offer.expiration_time_ms)
  ) {
    ctx.addIssue({
      code: "custom",
      message: flowValidationCodes.waTemplateLtoExpirationRequired,
      path: [...basePath, "limited_time_offer", "expiration_time_ms"],
    })
  }
}
