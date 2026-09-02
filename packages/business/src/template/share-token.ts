const SHARE_TOKEN_BYTES = 32

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

/**
 * Manual base64url encode over raw bytes using arithmetic (no bitwise
 * operators, per lint policy; no `Buffer`, since that's a Node global not
 * guaranteed in the Edge Runtime that `packages/business`'s barrel is
 * traced into — see `__tests__/edge-safe-import-graph.test.ts`).
 */
const toBase64Url = (bytes: Uint8Array): string => {
  let result = ""
  for (let index = 0; index < bytes.length; index += 3) {
    const byte1 = bytes[index]
    const byte2 = bytes[index + 1] ?? 0
    const byte3 = bytes[index + 2] ?? 0
    const hasByte2 = index + 1 < bytes.length
    const hasByte3 = index + 2 < bytes.length

    const combined = byte1 * 65_536 + byte2 * 256 + byte3

    result += BASE64URL_ALPHABET[Math.floor(combined / 262_144) % 64]
    result += BASE64URL_ALPHABET[Math.floor(combined / 4096) % 64]
    if (hasByte2) {
      result += BASE64URL_ALPHABET[Math.floor(combined / 64) % 64]
    }
    if (hasByte3) {
      result += BASE64URL_ALPHABET[combined % 64]
    }
  }
  return result
}

/**
 * High-entropy share token — NEVER the row's own snowflake id, which is
 * enumerable (sequential, time-ordered) and would let a share link be
 * guessed. 32 random bytes via the Web Crypto API, which — unlike
 * `node:crypto` — is available in both Node and the Edge Runtime.
 */
export const generateShareToken = (): string => {
  const bytes = new Uint8Array(SHARE_TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}
