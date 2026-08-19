import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Signed string is `${timestamp}.${rawBody}` — the timestamp is folded into
 * the signature so a captured payload cannot be replayed later. Keyed by the
 * per-inbox `signingSecret`, not the global encryption key: each API channel
 * has its own secret, unlike `link-signature.ts` which signs against a
 * single global key.
 */
const serializeSignedPayload = (timestamp: string, rawBody: string): string =>
  `${timestamp}.${rawBody}`

export const signApiPayload = (
  signingSecret: string,
  timestamp: string,
  rawBody: string,
): string =>
  createHmac("sha256", signingSecret)
    .update(serializeSignedPayload(timestamp, rawBody))
    .digest("hex")

export const verifyApiSignature = (
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  signature: string | null | undefined,
): boolean => {
  if (!signature) {
    return false
  }

  const expected = signApiPayload(signingSecret, timestamp, rawBody)
  const expectedBuffer = Buffer.from(expected, "hex")
  const actualBuffer = Buffer.from(signature, "hex")

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  )
}
