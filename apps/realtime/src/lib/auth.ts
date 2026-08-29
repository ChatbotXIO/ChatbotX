import ky from "ky"
import type * as Party from "partykit/server"
import { env } from "../env"
import { logger } from "../logger"

const ORIGIN_ALLOWLIST_CACHE_TTL_MS = 60_000

type OriginAllowlistEntry = { origin: string | null; expiresAt: number }

const originAllowlistCache = new Map<string, OriginAllowlistEntry>()

/**
 * Asks the builder whether `domainParam` is one of this platform's own
 * registered origins (broker, builder URL, or an active white-label custom
 * domain) — realtime is a PartyKit edge service with no database access, so
 * it cannot check `CustomDomain` itself. Cached briefly to keep this off the
 * hot connect path. Returns `null` on no match or a network failure — never
 * a guess.
 */
const resolveAllowlistedOrigin = async (
  domainParam: string,
): Promise<string | null> => {
  let hostname: string
  try {
    const candidate = new URL(domainParam)
    if (candidate.protocol !== "https:" || !candidate.hostname) {
      return null
    }
    hostname = candidate.hostname
  } catch {
    return null
  }

  const cached = originAllowlistCache.get(hostname)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.origin
  }

  let origin: string | null = null
  try {
    const verifyUrl = new URL(
      "/api/realtime/verify-origin",
      env.NEXT_PUBLIC_BUILDER_URL,
    )
    verifyUrl.searchParams.set("host", hostname)
    const result = await ky
      .get(verifyUrl.toString())
      .json<{ allowed: boolean; origin?: string }>()
    origin = result.allowed && result.origin ? result.origin : null
  } catch (error) {
    logger.error({ err: error, hostname }, "Failed to verify realtime domain")
    origin = null
  }

  originAllowlistCache.set(hostname, {
    origin,
    expiresAt: Date.now() + ORIGIN_ALLOWLIST_CACHE_TTL_MS,
  })
  return origin
}

export type Session = {
  user: {
    name: string | null
    email: string | null
    id: string
  }
  session: {
    expiresAt: string
  }
}

/** Check that the user exists, and isn't expired */
export const isSessionValid = (session?: Session | null): boolean =>
  Boolean(
    session &&
      (!session.session.expiresAt ||
        session.session.expiresAt > new Date().toISOString()),
  )

/**
 * Resolves the tenant origin to verify the one-time token against. Browser
 * clients send an `Origin` header, which the browser itself controls, so it
 * is trusted directly. React Native's WebSocket implementation sends no
 * `Origin`, so those clients pass `?domain=<tenant-host>` instead — since
 * that value is fully client-supplied, it is checked against the builder's
 * registered-origin allowlist (`resolveAllowlistedOrigin`) and rejected on no
 * match. It never falls through to an attacker-controlled value.
 */
const resolveVerificationOrigin = async (
  headers: Party.Request["headers"],
  domainParam: string | null,
): Promise<string> => {
  const origin = headers.get("origin")
  if (origin) {
    return origin
  }

  const allowlistedOrigin = domainParam
    ? await resolveAllowlistedOrigin(domainParam)
    : null

  if (!allowlistedOrigin) {
    throw new Error("Unrecognized domain")
  }

  return allowlistedOrigin
}

export const getAuthSession = async (
  proxiedRequest: Party.Request,
): Promise<Session> => {
  const url = new URL(proxiedRequest.url)
  logger.info({ proxiedRequest }, "proxiedRequest")
  const token = url.searchParams.get("token")
  if (!token) {
    throw new Error("No token provided")
  }

  const headers = proxiedRequest.headers
  const origin = await resolveVerificationOrigin(
    headers,
    url.searchParams.get("domain"),
  )
  logger.info({ origin, token }, "origin")
  const verificationUrl = new URL(
    "/api/auth/one-time-token/verify",
    origin,
  ).toString()

  try {
    const session = await ky
      .post(verificationUrl, {
        json: {
          token,
        },
      })
      .json<Session | null>()

    if (session && isSessionValid(session)) {
      return session
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to authenticate user")
    throw new Error("Failed to authenticate user")
  }

  throw new Error("Failed to authenticate user")
}
