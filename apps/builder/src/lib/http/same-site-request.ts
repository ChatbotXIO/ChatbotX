/**
 * Rejects genuine cross-site POSTs to state-changing Route Handlers. Next.js
 * Server Actions get an automatic Origin check for free; a plain Route
 * Handler under `app/api/*` does not, so routes that mutate state (or accept
 * a large upload) need this as defense-in-depth alongside the session
 * cookie, which remains the primary auth gate.
 *
 * `Sec-Fetch-Site` is a browser-set fetch metadata header the client cannot
 * override. An absent header (an older browser, or a non-browser client)
 * fails OPEN here — same as before this check existed — because the session
 * cookie is still required and still the primary gate. Same-origin and
 * same-site requests pass, so white-label custom domains — which serve the
 * API from the same host as the page — are unaffected.
 */
export const isCrossSiteRequest = (req: Request): boolean =>
  req.headers.get("sec-fetch-site") === "cross-site"
