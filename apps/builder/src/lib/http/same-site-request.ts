import { getRawPublicHostFromRequest } from "@chatbotx.io/utils"

/**
 * Rejects genuine cross-site POSTs to state-changing Route Handlers. Next.js
 * Server Actions get an automatic Origin check for free; a plain Route
 * Handler under `app/api/*` does not, so routes that mutate state (or accept
 * a large upload) need this as defense-in-depth alongside the session
 * cookie, which remains the primary auth gate.
 *
 * Verification order, each one only consulted when the previous signal is
 * unavailable:
 * 1. `Sec-Fetch-Site` — a browser-set fetch metadata header the client
 *    cannot override. Authoritative when present.
 * 2. `Origin` compared against the request's resolved PUBLIC host — via
 *    {@link getRawPublicHostFromRequest} (`@chatbotx.io/utils`), the same
 *    Forwarded → X-Forwarded-Host → Host resolution every other public-URL
 *    caller in this codebase uses (`proxy.ts`, the OAuth callback routes),
 *    not a raw `Host` header comparison — a deployment behind a reverse
 *    proxy sets `Host` to an internal value, and only the forwarded
 *    headers carry the host the browser actually used. `Origin` is sent by
 *    every modern browser for `fetch`/`sendBeacon` POSTs, same-origin or
 *    not, and (like `Sec-Fetch-Site`) not something client script can
 *    override.
 * 3. `Referer` compared the same way — a same-origin page navigation or an
 *    older browser that omits `Origin` on a same-origin request still
 *    carries this.
 *
 * If NONE of the three can be read, the request fails CLOSED (treated as
 * cross-site) — unlike the previous version of this check, which failed
 * OPEN when `Sec-Fetch-Site` alone was absent. The session cookie remains
 * required either way, but a same-site page load always carries at least
 * one of these three headers, so this is not expected to reject legitimate
 * traffic; white-label custom domains — which serve the API from the same
 * host as the page — are unaffected, since the host is resolved from the
 * incoming request itself, never a hardcoded origin.
 *
 * Why trusting `Forwarded`/`X-Forwarded-Host` here is safe, not a spoofing
 * hole: this check exists to defend against a CROSS-SITE browser sending a
 * forged request (a page on evil.example.com making the browser POST here).
 * A cross-site page's script cannot set ANY of `Sec-Fetch-Site`, `Origin`,
 * `Referer`, or `Forwarded`/`X-Forwarded-Host` on a `fetch`/`sendBeacon`
 * request — those are forbidden request-header names the Fetch spec lets
 * the browser itself set but never client script (setting one throws, and
 * a cross-origin `fetch` with custom headers additionally triggers a CORS
 * preflight this same-origin-only API never opts into anyway). The ONLY
 * party that can ever set `Forwarded`/`X-Forwarded-Host` here is this
 * deployment's own reverse proxy — which is exactly why it must OVERWRITE
 * (not merely append to) those headers on every request it forwards, never
 * passing through whatever a client sent; see the proxy requirement noted
 * in `docs/realtime.md`. Compromising this check would require compromising
 * that trusted proxy hop itself, not forging a browser request.
 *
 * Scheme (`http`/`https`) is deliberately NOT part of this comparison —
 * only `host` (hostname + port). A same-site request that happens to arrive
 * over the "wrong" scheme (e.g. a proxy terminating TLS and forwarding
 * over plain HTTP internally) is still same-site; scheme confusion is a
 * transport/deployment concern for `getPublicProtocolFromRequest`
 * (`@chatbotx.io/utils`), not this same-SITE check.
 */
export const isCrossSiteRequest = (req: Request): boolean => {
  const secFetchSite = req.headers.get("sec-fetch-site")
  if (secFetchSite) {
    return secFetchSite === "cross-site"
  }

  const host = getRawPublicHostFromRequest(req)
  if (!host) {
    return true
  }

  const origin = req.headers.get("origin")
  if (origin) {
    return !isSameHost(origin, host)
  }

  const referer = req.headers.get("referer")
  if (referer) {
    return !isSameHost(referer, host)
  }

  return true
}

function isSameHost(urlLike: string, host: string): boolean {
  try {
    return new URL(urlLike).host === host
  } catch {
    // An unparsable Origin/Referer can't be proven same-host — fail closed.
    return false
  }
}
