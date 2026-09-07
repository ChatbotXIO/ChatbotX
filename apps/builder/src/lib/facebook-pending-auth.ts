import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import { cookies } from "next/headers"
import { z } from "zod"

export const FB_MESSENGER_PENDING_AUTH_COOKIE = "fb_messenger_pending_auth"
export const FB_INSTAGRAM_PENDING_AUTH_COOKIE = "fb_instagram_pending_auth"
export const FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE =
  "fb_instagram_facebook_pending_auth"
export const FB_PENDING_AUTH_MAX_AGE = 600 // seconds — 10 minutes

/**
 * The one cookie-option set every pending-auth write uses (the OAuth callback's
 * three channels and the Messenger reuse route), so no site can scope the
 * cookie differently from the rest.
 *
 * `path: "/"` is load-bearing: the per-account connect is an oRPC POST to
 * `RPC_ENDPOINT_PATH` (a server action could not run in parallel), and a
 * cookie scoped to the picker page — as these were — is simply never sent
 * there, so every batch would fail as `sessionExpired`.
 * Widening the path does not weaken the cookie: it stays `httpOnly`,
 * encrypted, `SameSite=Lax` and 10-minute-lived, and it is only ever read
 * server-side by `readPendingAuth`.
 *
 * Three invariants here are TEST-ENFORCED against Next's real
 * `ResponseCookies` (not a mock) in
 * `__tests__/facebook-pending-auth.cookie-store.test.ts` — changing any of
 * them fails there:
 *
 *   1. exactly one `Set-Cookie` per cookie name (see `writePendingAuth`);
 *   2. `path: "/"`, which RFC 6265 §5.1.4 path-matches `RPC_ENDPOINT_PATH` and
 *      every `/channels/<channel>/select` picker route;
 *   3. `maxAge` of `FB_PENDING_AUTH_MAX_AGE` (10 minutes), plus `httpOnly`,
 *      `SameSite=Lax`, and `Secure` in production only.
 */
function pendingAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: FB_PENDING_AUTH_MAX_AGE,
    path: "/",
  } as const
}

/** The minimal cookie surface this module needs — Next's `cookies()` store satisfies it. */
type PendingAuthCookieStore = {
  set: (
    name: string,
    value: string,
    options: Record<string, unknown>,
  ) => unknown
}

/**
 * Writes one channel's pending-auth cookie at the root path. Every set site
 * goes through here so the options cannot drift.
 *
 * Deliberately ONE `set` per name: Next's response cookie store is keyed by
 * cookie name (`ResponseCookies._parsed.set(name, …)`), so a second `set` —
 * e.g. expiring the picker-scoped cookie an older release wrote under the
 * same name — would silently REPLACE the real cookie and the picker would
 * see no session at all. A leftover picker-scoped cookie from before the
 * root-path change therefore simply ages out on its own 10-minute `maxAge`.
 *
 * That collapse is not an argument about Next's source: the cookie-store test
 * writes two `set()` calls into a real `ResponseCookies` and asserts the
 * `Headers` end up with ONE `Set-Cookie` — so re-introducing a second write
 * here fails immediately.
 */
export function writePendingAuth(
  cookieStore: PendingAuthCookieStore,
  cookieName: string,
  token: string,
): void {
  cookieStore.set(cookieName, token, pendingAuthCookieOptions())
}

/**
 * Shape of the decrypted pending-auth cookie payload the OAuth callback
 * stores for the Messenger/Instagram/Instagram-via-Facebook pickers, and
 * every per-account connect action's ONLY source of the user token and
 * `workspaceId` (never client input — plan §4.7). `readPendingAuth` parses
 * the decrypted JSON with this schema instead of blindly casting it, so a
 * tampered or stale-shape payload is treated the same as a missing cookie.
 */
export const facebookAuthCallbackSchema = z.object({
  userToken: z.string().min(1),
  /** Graph identity of the authorizing user; absent when the lookup failed. */
  userId: z.string().optional(),
  userName: z.string().optional(),
  /** Provider-hosted profile picture URL (not yet uploaded to storage). */
  userAvatarUrl: z.string().optional(),
  workspaceId: z.string().min(1),
  referer: z.string().min(1),
  version: z.string().min(1),
  expiresAt: z.number(),
})
export type FacebookAuthCallback = z.infer<typeof facebookAuthCallbackSchema>

export async function encryptAuth(data: unknown): Promise<string> {
  const encrypted = await encryptUtils.encryptObject(data)
  return Buffer.from(JSON.stringify(encrypted)).toString("base64url")
}

/** Decrypts the base64url-wrapped envelope down to its raw JSON payload; null on any tamper/decrypt failure. */
async function decryptToRawPayload(token: string): Promise<unknown | null> {
  try {
    const raw = JSON.parse(Buffer.from(token, "base64url").toString())
    const encrypted = encryptedDataSchema.parse(raw)
    const text = await encryptUtils.decryptText(encrypted)
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Read and decrypt the pending-auth cookie for a channel; null if missing,
 * expired, tampered, OR schema-invalid. Every picker page and per-account
 * connect action uses this so a malformed payload — a required field
 * renamed/dropped by a future change, or an outright forged cookie — is
 * treated the same as no session at all instead of reaching the caller with
 * `undefined` fields.
 */
export async function readPendingAuth(
  cookieName: string,
): Promise<FacebookAuthCallback | null> {
  const token = (await cookies()).get(cookieName)?.value
  if (!token) {
    return null
  }
  const raw = await decryptToRawPayload(token)
  const parsed = facebookAuthCallbackSchema.safeParse(raw)
  if (!parsed.success || Date.now() > parsed.data.expiresAt) {
    return null
  }
  return parsed.data
}
