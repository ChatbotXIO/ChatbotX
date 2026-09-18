const HEX_RADIX = 16
const BYTE_MASK = 0xff
const VERSION_4_NIBBLE_MASK = 0x0f
const VERSION_4_NIBBLE_VALUE = 0x40
const VARIANT_NIBBLE_MASK = 0x3f
const VARIANT_NIBBLE_VALUE = 0x80

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) =>
    byte.toString(HEX_RADIX).padStart(2, "0"),
  ).join("")
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-")
}

/** Stamps the UUIDv4 version (byte 6, high nibble) and variant (byte 8, high
 * two bits) into an otherwise-random 16-byte buffer, per RFC 4122 §4.4.
 * Bitwise ops are the standard, idiomatic way to set specific bits of a
 * byte — not a typo'd `&&`/`||`. */
function stampUuidV4VersionAndVariant(bytes: Uint8Array): void {
  // biome-ignore lint/suspicious/noBitwiseOperators: RFC 4122 nibble masking, not a typo'd logical operator
  bytes[6] = (bytes[6] & VERSION_4_NIBBLE_MASK) | VERSION_4_NIBBLE_VALUE
  // biome-ignore lint/suspicious/noBitwiseOperators: RFC 4122 nibble masking, not a typo'd logical operator
  bytes[8] = (bytes[8] & VARIANT_NIBBLE_MASK) | VARIANT_NIBBLE_VALUE
}

/** UUIDv4 built from `crypto.getRandomValues` — still cryptographically
 * random, just not the native one-call helper. */
function uuidFromGetRandomValues(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  stampUuidV4VersionAndVariant(bytes)
  return bytesToUuid(bytes)
}

/** Last-resort UUIDv4 from `Math.random()` — not cryptographically random,
 * used only when no Web Crypto API exists at all. Acceptable here because
 * this id is never a security token, only an opaque identifier for
 * non-presence callers (e.g. idempotency keys). */
function uuidFromMathRandom(): string {
  const bytes = new Uint8Array(16)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * (BYTE_MASK + 1))
  }
  stampUuidV4VersionAndVariant(bytes)
  return bytesToUuid(bytes)
}

/**
 * `crypto.randomUUID()` is only available in a secure context (HTTPS or
 * localhost) per the Web Crypto spec — some implementations simply omit
 * it outside one, others throw. A self-hosted ChatbotX instance served
 * over plain HTTP on a LAN would otherwise crash every caller of
 * `crypto.randomUUID()`. This tries, in order:
 * 1. `crypto.randomUUID()` — the native helper, when it exists and doesn't
 *    throw;
 * 2. `crypto.getRandomValues()` — still cryptographically random, just
 *    hand-assembled into UUIDv4 form;
 * 3. `Math.random()` — non-cryptographic, only reached when no Web Crypto
 *    API is present at all.
 */
export function generateRandomUuid(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    try {
      return crypto.randomUUID()
    } catch {
      // Insecure context threw instead of omitting the method — fall
      // through to the manual builders below.
    }
  }

  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    return uuidFromGetRandomValues()
  }

  return uuidFromMathRandom()
}
