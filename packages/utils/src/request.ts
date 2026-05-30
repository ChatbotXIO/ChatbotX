export function getPublicOriginFromRequest(request: Request): string {
  const protocol = getPublicProtocolFromRequest(request)
  const host = getPublicHostFromRequest(request)
  return `${protocol}://${host}`
}

export function getPublicUrlFromRequest(request: Request): URL {
  const url = new URL(request.url)
  url.host = getPublicHostFromRequest(request)
  url.port = ""
  return url
}

export function getPublicProtocolFromRequest(
  request: Request,
): "http" | "https" {
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

export function getPublicHostFromRequest(request: Request): string {
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

  const host = normalizeHost(request.headers.get("host"))
  if (host) {
    return host
  }

  return "localhost:3123"
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
