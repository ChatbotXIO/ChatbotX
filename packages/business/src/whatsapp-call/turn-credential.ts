/**
 * coturn `use-auth-secret` time-limited REST credentials — channel-agnostic
 * TURN infrastructure shared by every WebRTC calling transport (today: the
 * WhatsApp VoIP browser path via {@link voipTurnCredentialService}). Kept
 * separate from any one transport's service so removing a transport never
 * removes the shared minter.
 *
 * Web Crypto only (`globalThis.crypto`), never `node:crypto` — this module
 * must stay reachable from an Edge Runtime bundle (see
 * `__tests__/edge-safe-import-graph.test.ts`), the same discipline as
 * `@chatbotx.io/encryption`'s `encryptUtils`.
 */

export const TURN_CREDENTIAL_TTL_SECONDS = 60 * 60

/**
 * Mints a coturn REST credential: username is `<unix-expiry>:<userId>`,
 * password is base64(HMAC-SHA1(secret, username)) — the documented coturn
 * REST API scheme.
 */
export const mintTurnCredential = async (input: {
  secret: string
  userId: string
  ttlSeconds?: number
}): Promise<{ username: string; credential: string }> => {
  const expiry =
    Math.floor(Date.now() / 1000) +
    (input.ttlSeconds ?? TURN_CREDENTIAL_TTL_SECONDS)
  const username = `${expiry}:${input.userId}`
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(username),
  )
  const credential = Buffer.from(new Uint8Array(signature)).toString("base64")
  return { username, credential }
}
