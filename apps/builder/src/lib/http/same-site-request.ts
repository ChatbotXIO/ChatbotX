import { getRawPublicHostFromRequest } from "@chatbotx.io/utils"

/**
 * Guards plain `app/api/*` handlers, which unlike Server Actions get no
 * automatic Origin check. Checks, in order: `Sec-Fetch-Site`; `Origin`
 * vs. the resolved public host (`getRawPublicHostFromRequest`, proxy-safe
 * unlike a raw `Host` compare); `Referer`. Fails CLOSED if none are
 * readable. These headers are unforgeable cross-site (forbidden header
 * names), so the proxy must overwrite rather than pass them through.
 * Scheme is excluded on purpose — TLS-terminated-at-proxy is still same-site.
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
