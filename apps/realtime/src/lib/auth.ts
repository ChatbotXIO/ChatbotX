import ky from "ky"
import type * as Party from "partykit/server"
import { logger } from "../logger"

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
 * clients send an `Origin` header; React Native's WebSocket implementation
 * sends none, so those clients must pass `?domain=<tenant-host>` instead.
 * Only accepts an `https://` origin shaped like a real host — never fall
 * through to an attacker-controlled value.
 */
const resolveVerificationOrigin = (
  headers: Party.Request["headers"],
  domainParam: string | null,
): string => {
  const origin = headers.get("origin")
  if (origin) {
    return origin
  }

  if (domainParam) {
    try {
      const candidate = new URL(domainParam)
      if (candidate.protocol === "https:" && candidate.hostname) {
        return candidate.origin
      }
    } catch {
      // fall through to default below
    }
  }

  return "https://example.com"
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
  const origin = resolveVerificationOrigin(
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
