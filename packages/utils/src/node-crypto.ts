import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Synchronous, `node:crypto`-backed crypto helpers. Kept in a separate file
 * from `./crypto` (which deliberately uses Web Crypto so it stays usable
 * from edge runtimes): consumers that already run in Node — every
 * `integrations/*` package and `apps/worker` — can import this without
 * pulling `node:crypto` into an edge-bundled subpath.
 */

const DEFAULT_HMAC_SIGNATURE_PREFIX = "sha256="

export type VerifyHmacSha256SignatureInput = {
  rawBody: Uint8Array
  secret: string
  signatureHeader: string | null | undefined
  /** Defaults to `"sha256="`, matching `X-Hub-Signature-256`. */
  prefix?: string
}

const decodeHexSignature = (hex: string): Buffer | null => {
  if (hex.length === 0 || hex.length % 2 !== 0) {
    return null
  }

  // Buffer.from(..., "hex") never throws on invalid hex — it silently stops
  // decoding at the first bad pair, so a shorter-than-expected result is how
  // malformed hex (e.g. "zz") is detected.
  const decoded = Buffer.from(hex, "hex")
  return decoded.length === hex.length / 2 ? decoded : null
}

/**
 * Verifies a Meta-style `sha256=<hex>` webhook signature header (commonly
 * `X-Hub-Signature-256`) against the raw request bytes with a
 * `crypto.timingSafeEqual` comparison. Channel-agnostic — any inbound
 * webhook signed the same way (WhatsApp, Messenger, Instagram, …) can share
 * this instead of hand-rolling its own HMAC verification. Rejects (returns
 * `false`) on a missing header, wrong prefix, malformed hex, or a
 * length/value mismatch — never throws.
 */
export function verifyHmacSha256Signature(
  input: VerifyHmacSha256SignatureInput,
): boolean {
  const prefix = input.prefix ?? DEFAULT_HMAC_SIGNATURE_PREFIX
  if (!input.signatureHeader?.startsWith(prefix)) {
    return false
  }

  const providedBuffer = decodeHexSignature(
    input.signatureHeader.slice(prefix.length),
  )
  if (!providedBuffer) {
    return false
  }

  const expectedBuffer = createHmac("sha256", input.secret)
    .update(input.rawBody)
    .digest()

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  )
}
