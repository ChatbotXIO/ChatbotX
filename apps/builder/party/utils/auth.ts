import ky from "ky"
import type * as Party from "partykit/server"

export type Session = {
  user: {
    name?: string
    email?: string
    image?: string
    id: string
  }
  expires?: string
}

/** Check that the user exists, and isn't expired */
export const isSessionValid = (session?: Session | null): boolean => {
  return Boolean(
    session && (!session.expires || session.expires > new Date().toISOString()),
  )
}

export const getNextAuthSession = async (
  proxiedRequest: Party.Request,
): Promise<Session> => {
  const headers = proxiedRequest.headers
  const origin = headers.get("origin") ?? ""
  const cookie = headers.get("cookie") ?? ""
  const url = `${origin}/api/auth/session`

  const session: Session | null = await ky
    .get(url, {
      headers: {
        Accept: "application/json",
        Cookie: cookie,
      },
    })
    .json()

  if (session && isSessionValid(session)) {
    return session
  }

  throw new Error("Failed to authenticate user")
}
