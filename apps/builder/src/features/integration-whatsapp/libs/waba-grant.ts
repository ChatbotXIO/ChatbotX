import { ChatbotXException } from "@chatbotx.io/business/errors"

/**
 * Why a token's `whatsapp_business_management` grant could not be matched to
 * the WABA a caller expects. Keys double as the lookup into the caller's
 * translated error messages.
 */
export const WABA_GRANT_FAILURES = {
  /** The token was granted no WABA at all. */
  NONE: "none",
  /** The token has WABAs, but not the one the caller asked for. */
  MISMATCH: "mismatch",
} as const

export type WabaGrantFailure =
  (typeof WABA_GRANT_FAILURES)[keyof typeof WABA_GRANT_FAILURES]

export type WabaGrantErrorMessages = Record<WabaGrantFailure, string>

export type WabaGrantResolution =
  | { wabaId: string; failure?: never }
  | { wabaId?: never; failure: WabaGrantFailure }

/**
 * Pick the WABA an embedded-signup token is for. A system-user token lists
 * every WABA the business has shared with the app, in no stable order, so a
 * caller that already knows its WABA (reconnect, or a connect whose client sent
 * `wabaId`) must match by membership — never by position. Only a fresh signup
 * with no hint falls back to the first grant.
 */
export function resolveGrantedWabaId(params: {
  grantedWabaIds: readonly string[]
  requestedWabaId?: string | null
}): WabaGrantResolution {
  const [firstGrantedWabaId] = params.grantedWabaIds
  if (!firstGrantedWabaId) {
    return { failure: WABA_GRANT_FAILURES.NONE }
  }
  if (!params.requestedWabaId) {
    return { wabaId: firstGrantedWabaId }
  }
  if (!params.grantedWabaIds.includes(params.requestedWabaId)) {
    return { failure: WABA_GRANT_FAILURES.MISMATCH }
  }
  return { wabaId: params.requestedWabaId }
}

/** `resolveGrantedWabaId`, raising the caller's translated message on failure. */
export function requireGrantedWabaId(params: {
  grantedWabaIds: readonly string[]
  requestedWabaId?: string | null
  errorMessages: WabaGrantErrorMessages
}): string {
  const resolution = resolveGrantedWabaId(params)
  if (resolution.failure) {
    throw new ChatbotXException(params.errorMessages[resolution.failure])
  }
  return resolution.wabaId
}
