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
  const origin = headers.get("origin") ?? "https://example.com"
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
    console.error("Failed to authenticate user", error)
    throw new Error("Failed to authenticate user")
  }

  throw new Error("Failed to authenticate user")
}
