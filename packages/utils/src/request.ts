import { parseEnvBool } from "./env"
import { keys } from "./keys"

export function getPublicOriginFromRequest(request: Request): string {
  const protocol = getPublicProtocolFromRequest(request)
  const host = getPublicHostFromRequest(request)
  return `${protocol}://${host}`
}

export function getPublicUrlFromRequest(request: Request): URL {
  const url = new URL(request.url)
  const host = getPublicHostFromRequest(request)
  url.host = host
  url.protocol = getPublicProtocolFromRequest(request)
  url.port = getPortFromHost(host)
  return url
}

/**
 * The port carried by a host (`localhost:3123` → `"3123"`), or an empty string
 * when it carries none (`app.example.com`).
 *
 * Assigning `URL.host` a value *without* a port leaves the URL's previous port
 * untouched (per the URL spec), so behind a reverse proxy the internal port
 * would leak into the public URL. Every caller that assigns `host` must
 * therefore assign the port as well — clearing it unconditionally instead
 * would drop the port in local development, where the public host legitimately
 * is `localhost:3123`. Pass the same host value that was assigned: resolving
 * the public host a second time could disagree with the first.
 *
 * Parsing is delegated to the URL parser rather than searching for a `":"`:
 * the colons inside a bracketed IPv6 literal (`[::1]`) are not port
 * separators, and an out-of-range or non-numeric port must clear the port
 * rather than leave the internal one in place.
 */
export function getPortFromHost(host: string): string {
  try {
    return new URL(`http://${host}`).port
  } catch {
    return ""
  }
}

export function getPublicProtocolFromRequest(
  request: Request,
): "http" | "https" {
  if (parseEnvBool(keys().FORCE_PUBLIC_HTTPS)) {
    return "https"
  }

  const forwarded = request.headers.get("forwarded")
  const forwardedProtocol = extractForwardedValue(forwarded, "proto")
  if (forwardedProtocol === "http" || forwardedProtocol === "https") {
    return forwardedProtocol
  }

  const xForwardedProto = request.headers.get("x-forwarded-proto")
  if (xForwardedProto === "http" || xForwardedProto === "https") {
    return xForwardedProto
  }

  return request.url.startsWith("http://") ? "http" : "https"
}

/**
 * Same resolution as {@link getPublicHostFromRequest} but without its `localhost:3123`
 * fallback — `null` when unresolved. Use for checks that must tell "genuinely unknown" apart
 * from a dev-only invented default (e.g. same-site comparisons); use
 * {@link getPublicHostFromRequest} for building a URL.
 */
export function getRawPublicHostFromRequest(request: Request): string | null {
  const forwarded = request.headers.get("forwarded")
  const forwardedHost = normalizeHost(extractForwardedValue(forwarded, "host"))
  if (forwardedHost) {
    return forwardedHost
  }

  const xForwardedHost = normalizeHost(
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim(),
  )
  if (xForwardedHost) {
    return xForwardedHost
  }

  return normalizeHost(request.headers.get("host"))
}

export function getPublicHostFromRequest(request: Request): string {
  return getRawPublicHostFromRequest(request) ?? "localhost:3123"
}

function extractForwardedValue(
  forwarded: string | null,
  key: "host" | "proto",
): string | null {
  if (!forwarded) {
    return null
  }

  const firstEntry = forwarded.split(",")[0]?.trim()
  if (!firstEntry) {
    return null
  }

  for (const pair of firstEntry.split(";")) {
    const [rawKey, rawValue] = pair.split("=", 2)
    if (!(rawKey && rawValue)) {
      continue
    }
    if (rawKey.trim().toLowerCase() !== key) {
      continue
    }
    return rawValue.trim().replace(/^"|"$/g, "")
  }

  return null
}

function normalizeHost(host: string | null | undefined): string | null {
  if (!host) {
    return null
  }

  return host.trim().toLowerCase()
}
