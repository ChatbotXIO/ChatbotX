/**
 * Signed string is `${timestamp}.${rawBody}` — the timestamp is folded into
 * the signature so a captured payload cannot be replayed later. Keyed by the
 * per-inbox `signingSecret`, not the global encryption key: each API channel
 * has its own secret, unlike `link-signature.ts` which signs against a
 * single global key.
 *
 * Uses Web Crypto (`crypto.subtle`) instead of `node:crypto` so this module
 * stays usable from edge runtimes — see `channel-api-token-auth.ts` for the
 * same pattern applied to token hashing.
 */
const serializeSignedPayload = (timestamp: string, rawBody: string): string =>
  `${timestamp}.${rawBody}`

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")

const hexToBytes = (hex: string): Uint8Array | null => {
  if (hex.length % 2 !== 0) {
    return null
  }

  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) {
      return null
    }
    bytes[i] = byte
  }
  return bytes
}

const importHmacKey = (signingSecret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )

export const signApiPayload = async (
  signingSecret: string,
  timestamp: string,
  rawBody: string,
): Promise<string> => {
  const key = await importHmacKey(signingSecret)
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(serializeSignedPayload(timestamp, rawBody)),
  )
  return bytesToHex(new Uint8Array(signature))
}

const timingSafeEqualBytes = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) {
    return false
  }

  let diff = 0
  for (let i = 0; i < a.length; i++) {
    // biome-ignore lint/suspicious/noBitwiseOperators: constant-time compare requires XOR/OR to avoid branching on byte equality
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}

export const verifyApiSignature = async (
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  signature: string | null | undefined,
): Promise<boolean> => {
  if (!signature) {
    return false
  }

  const actualBytes = hexToBytes(signature)
  if (!actualBytes) {
    return false
  }

  const expected = await signApiPayload(signingSecret, timestamp, rawBody)
  const expectedBytes = hexToBytes(expected)
  if (!expectedBytes) {
    return false
  }

  return timingSafeEqualBytes(actualBytes, expectedBytes)
}
