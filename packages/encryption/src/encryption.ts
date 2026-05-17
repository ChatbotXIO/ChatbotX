/// <reference lib="dom" />
import { z } from "zod"
import { bytesToHex, concatBytes, hexToBytes } from "./binary"
import { env } from "./keys"

const CURRENT_VERSION = 1
const IV_LENGTH_BYTES = 12
const AUTH_TAG_LENGTH_BYTES = 16
const AUTH_TAG_LENGTH_BITS = AUTH_TAG_LENGTH_BYTES * 8
const KEY_LENGTH_BYTES = 32
const ALGORITHM = "AES-GCM" as const

export const encryptedDataSchema = z.object({
  v: z.literal(CURRENT_VERSION),
  // kid identifies which ENCRYPTION_KEY_ID encrypted this blob.
  // Absent on blobs written before key versioning was introduced.
  kid: z.string().optional(),
  iv: z.string().length(IV_LENGTH_BYTES * 2),
  text: z.string().min(1),
  tag: z.string().length(AUTH_TAG_LENGTH_BYTES * 2),
})
export type EncryptedData = z.infer<typeof encryptedDataSchema>

// Cache imported CryptoKey objects by their hex value to avoid re-importing
// on every call.
const keyCache = new Map<string, CryptoKey>()

const importKey = async (hex: string): Promise<CryptoKey> => {
  const cached = keyCache.get(hex)
  if (cached) {
    return cached
  }

  const keyBytes = hexToBytes(hex)
  if (keyBytes.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `Encryption key must decode to ${KEY_LENGTH_BYTES} bytes; got ${keyBytes.length}.`,
    )
  }
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: ALGORITHM },
    false,
    ["encrypt", "decrypt"],
  )
  keyCache.set(hex, key)
  return key
}

// Resolve which raw key hex to use for a given kid.
//
// Rules:
//   kid matches active ENCRYPTION_KEY_ID     → use ENCRYPTION_KEY
//   kid absent, ENCRYPTION_KEY_PREV not set  → use ENCRYPTION_KEY (legacy blob)
//   kid absent or non-active, PREV set       → use ENCRYPTION_KEY_PREV (rotation)
const resolveKeyHex = (kid?: string): string => {
  if (kid === env.ENCRYPTION_KEY_ID) {
    return env.ENCRYPTION_KEY
  }
  if (!(kid || env.ENCRYPTION_KEY_PREV)) {
    return env.ENCRYPTION_KEY
  }
  if (env.ENCRYPTION_KEY_PREV) {
    return env.ENCRYPTION_KEY_PREV
  }
  throw new Error(
    `Cannot decrypt: no key available for kid="${kid ?? "(none)"}". ` +
      "Set ENCRYPTION_KEY_PREV to the key that encrypted this blob.",
  )
}

const getKey = (kid?: string): Promise<CryptoKey> =>
  importKey(resolveKeyHex(kid))

const assertCurrentVersion = (v: number): void => {
  if (v !== CURRENT_VERSION) {
    throw new Error(
      `Unsupported encryption version: ${v}. Expected ${CURRENT_VERSION}.`,
    )
  }
}

// TextEncoder.encode() returns Uint8Array<ArrayBufferLike> in TS6; we copy
// into a fresh allocation so the buffer is always a plain ArrayBuffer.
const encode = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(new TextEncoder().encode(text))

const decode = (bytes: Uint8Array<ArrayBuffer>): string =>
  new TextDecoder().decode(bytes)

const buildAlgorithm = (
  iv: Uint8Array<ArrayBuffer>,
  aad?: string,
): AesGcmParams => ({
  name: ALGORITHM,
  iv,
  tagLength: AUTH_TAG_LENGTH_BITS,
  ...(aad !== undefined && { additionalData: encode(aad) }),
})

export const encryptUtils = {
  encryptText: async (text: string, aad?: string): Promise<EncryptedData> => {
    const key = await getKey(env.ENCRYPTION_KEY_ID)
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES))
    // Web Crypto appends the auth tag at the end of the ciphertext output
    const raw = await crypto.subtle.encrypt(
      buildAlgorithm(iv, aad),
      key,
      encode(text),
    )
    const output = new Uint8Array(raw)
    const ciphertext = output.slice(0, -AUTH_TAG_LENGTH_BYTES)
    const tag = output.slice(-AUTH_TAG_LENGTH_BYTES)
    return {
      v: CURRENT_VERSION,
      kid: env.ENCRYPTION_KEY_ID,
      iv: bytesToHex(iv),
      text: bytesToHex(ciphertext),
      tag: bytesToHex(tag),
    }
  },

  decryptText: async (
    encryptedData: EncryptedData,
    aad?: string,
  ): Promise<string> => {
    assertCurrentVersion(encryptedData.v)
    const key = await getKey(encryptedData.kid)
    const iv = hexToBytes(encryptedData.iv)
    // Web Crypto expects ciphertext + tag concatenated as a single buffer
    const combined = concatBytes(
      hexToBytes(encryptedData.text),
      hexToBytes(encryptedData.tag),
    )
    const raw = await crypto.subtle.decrypt(
      buildAlgorithm(iv, aad),
      key,
      combined,
    )
    return decode(new Uint8Array(raw))
  },

  encryptObject: (object: unknown, aad?: string): Promise<EncryptedData> =>
    encryptUtils.encryptText(JSON.stringify(object), aad),

  decryptObject: async <T>(
    encryptedData: EncryptedData,
    schema: z.ZodType<T>,
    aad?: string,
  ): Promise<T> => {
    const text = await encryptUtils.decryptText(encryptedData, aad)
    const parsed: unknown = JSON.parse(text)
    return schema.parse(parsed)
  },
}
