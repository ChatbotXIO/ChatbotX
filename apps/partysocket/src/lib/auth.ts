import ky from "ky"
import type * as Party from "partykit/server"
import { env } from "../env"

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
  const token = url.searchParams.get("token")
  if (!token) {
    throw new Error("No token provided")
  }

  const headers = proxiedRequest.headers
  const origin =
    env.NEXT_PUBLIC_PARTYSOCKET_AUTH_URL ??
    headers.get("origin") ??
    "https://example.com"

  console.log("originnnnnnnn", origin)

  const verificationUrl = new URL("/api/auth/one-time-token/verify", origin)

  const session: Session | null = await ky
    .post(verificationUrl, {
      headers: {
        Accept: "application/json",
      },
      json: {
        token,
      },
    })
    .json()

  if (session && isSessionValid(session)) {
    return session
  }

  throw new Error("Failed to authenticate user")
}
