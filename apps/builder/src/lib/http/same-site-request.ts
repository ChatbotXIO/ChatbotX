import { getRawPublicHostFromRequest } from "@chatbotx.io/utils"

/**
 * Rejects genuine cross-site POSTs to state-changing Route Handlers. Server
 * Actions get an Origin check for free; a plain `app/api/*` handler does
 * not, so mutating or upload routes need this alongside the session cookie,
 * which stays the primary auth gate.
 *
 * Three signals, each consulted only when the previous is absent:
 * 1. `Sec-Fetch-Site` — browser-set, authoritative when present.
 * 2. `Origin` vs the request's resolved PUBLIC host
 *    ({@link getRawPublicHostFromRequest}: Forwarded → X-Forwarded-Host →
 *    Host, the same resolution `proxy.ts` and the OAuth callbacks use).
 *    A raw `Host` comparison would break behind a reverse proxy.
 * 3. `Referer`, compared the same way — carried by page navigations and
 *    older browsers that omit `Origin`.
 *
 * With none of the three readable it fails CLOSED. A same-site page load
 * always carries at least one, and white-label custom domains are fine
 * because the host comes from the request, never a hardcoded origin.
 *
 * Trusting the forwarded headers is not a spoofing hole here: cross-site
 * script cannot set `Sec-Fetch-Site`, `Origin`, `Referer` or
 * `Forwarded`/`X-Forwarded-Host` (forbidden header names; custom headers
 * would also force a CORS preflight this API never opts into). Only this
 * deployment's own proxy can — which is why it must OVERWRITE those headers
 * rather than pass them through; see `docs/realtime.md`.
 *
 * Scheme is deliberately excluded — only hostname + port. A request arriving
 * over the "wrong" scheme (TLS terminated at the proxy) is still same-SITE;
 * scheme confusion belongs to `getPublicProtocolFromRequest`.
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
