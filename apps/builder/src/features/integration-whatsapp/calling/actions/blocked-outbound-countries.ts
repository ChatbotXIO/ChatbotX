/**
 * Meta forbids business-initiated VoIP calling from these countries (Graph
 * API error 138013 is the live backstop). An unresolved/unknown country fails
 * OPEN here rather than blocking a dial — Meta's rejection still catches it.
 * Shared by the dial-time and render-time gates so they can't drift apart.
 */
export const BLOCKED_OUTBOUND_COUNTRIES = new Set([
  "VN",
  "US",
  "CA",
  "EG",
  "NG",
])
