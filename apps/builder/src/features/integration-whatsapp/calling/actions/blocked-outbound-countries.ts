/**
 * Meta forbids business-initiated (VoIP) calling when the BUSINESS number's
 * country is one of these — Vietnam, the US, Canada, Egypt, and Nigeria per
 * Meta's WhatsApp Calling API documentation. Graph API error 138013 is the
 * live backstop, so an unresolved/unknown country (e.g. an invalid or
 * non-E.164 display number) fails OPEN here rather than blocking a dial —
 * Meta's own rejection still catches it.
 *
 * Single source of truth shared by `initiate-outbound-voip-call.action.ts`
 * (the O0 dial-time gate) and `resolve-outbound-call-mode.action.ts` (the
 * render-time gate) so the two eligibility checks can never drift apart.
 */
export const BLOCKED_OUTBOUND_COUNTRIES = new Set([
  "VN",
  "US",
  "CA",
  "EG",
  "NG",
])
