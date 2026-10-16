import { randomBytes, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"

const OAUTH_NONCE_COOKIE_NAME = "chatbotx_oauth_nonce"
const OAUTH_NONCE_BYTES = 24
const OAUTH_NONCE_MAX_AGE_SECONDS = 10 * 60
/** Every OAuth callback lives under this prefix, so the cookie never rides on other requests. */
const OAUTH_NONCE_COOKIE_PATH = "/integrations"

/**
 * Binds an OAuth round trip to the browser that started it.
 *
 * The OAuth `state` is base64 JSON the attacker can also build, so a callback
 * carrying a valid-looking state proves nothing about who initiated it. The
 * nonce goes into the `state` AND into an httpOnly cookie on the originating
 * host; the callback only proceeds when both match (`consumeOAuthNonce`). The
 * white-label relay hands the callback back to that same host before any of this
 * runs, so the cookie is always on the request that gets verified.
 */
export async function issueOAuthNonce(): Promise<string> {
  const nonce = randomBytes(OAUTH_NONCE_BYTES).toString("base64url")
  ;(await cookies()).set(OAUTH_NONCE_COOKIE_NAME, nonce, {
    path: OAUTH_NONCE_COOKIE_PATH,
    maxAge: OAUTH_NONCE_MAX_AGE_SECONDS,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  })
  return nonce
}

/**
 * Single use: the cookie is dropped whether or not the nonce matched, so a
 * callback can be replayed at most once. The deletion only reaches the browser
 * when the response carries cookie mutations — a redirect does, a `notFound()`
 * does not — so callers answer a mismatch with a redirect.
 */
export async function consumeOAuthNonce(
  presentedNonce: string | undefined,
): Promise<boolean> {
  const cookieStore = await cookies()
  const storedNonce = cookieStore.get(OAUTH_NONCE_COOKIE_NAME)?.value
  cookieStore.delete({
    name: OAUTH_NONCE_COOKIE_NAME,
    path: OAUTH_NONCE_COOKIE_PATH,
  })

  if (!(storedNonce && presentedNonce)) {
    return false
  }
  const stored = Buffer.from(storedNonce)
  const presented = Buffer.from(presentedNonce)
  return (
    stored.length === presented.length && timingSafeEqual(stored, presented)
  )
}
