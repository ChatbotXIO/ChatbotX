import { headers } from "next/headers"
import type { NextRequest } from "next/server"
import { logger } from "./log"

export async function getDomainFromHeader() {
  "use server"
  const headersList = await headers()
  const baseUrl = new URL(headersList.get("x-url") ?? "")

  logger.debug(`requested domain: ${baseUrl.hostname}`)

  return baseUrl.hostname
}

export function getPublicOriginFromRequest(request: NextRequest): string {
  const protocol = getPublicProtocolFromRequest(request)
  const host = getPublicHostFromRequest(request)
  return `${protocol}://${host}`
}

function getPublicProtocolFromRequest(request: NextRequest): "http" | "https" {
  const forwarded = request.headers.get("forwarded")
  const forwardedProtocol = extractForwardedValue(forwarded, "proto")
  if (forwardedProtocol === "http" || forwardedProtocol === "https") {
    return forwardedProtocol
  }

  const xForwardedProto = request.headers.get("x-forwarded-proto")
  if (xForwardedProto === "http" || xForwardedProto === "https") {
    return xForwardedProto
  }

  return request.nextUrl.protocol === "http:" ? "http" : "https"
}

function getPublicHostFromRequest(request: NextRequest): string {
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
