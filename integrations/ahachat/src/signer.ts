import {
  AHACHAT_SIGNATURE_AUDIENCE,
  AHACHAT_SIGNATURE_PURPOSE,
  AHACHAT_SIGNATURE_VERSION,
} from "./constants"
import type { AhachatExportKey } from "./keys"

/**
 * Request signing with Web Crypto only (`crypto.subtle`), so it runs in Node
 * and in the Edge bundle alike: the builder's oRPC router reaches it through
 * the contact-sync service. No `node:crypto` here (AGENTS.md invariant 25).
 */

const encoder = new TextEncoder()

const toHex = (bytes: ArrayBuffer | Uint8Array): string =>
  Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")

const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

// A signing key is imported once and kept: `importKey` is the only costly
// step. At most two secrets exist (active + next), so the map stays tiny and
// holds a non-extractable key object, never request data.
type SigningKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>
const importedKeys = new Map<string, Promise<SigningKey>>()

const importSigningKey = (hashKey: string): Promise<SigningKey> => {
  const cached = importedKeys.get(hashKey)
  if (cached) {
    return cached
  }
  const imported = crypto.subtle.importKey(
    "raw",
    fromBase64(hashKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  importedKeys.set(hashKey, imported)
  imported.catch(() => importedKeys.delete(hashKey))
  return imported
}

export type AhachatSignatureInput = {
  keyId: string
  timestamp: number
  nonce: string
  /** The exact path AhaChat sees, e.g. `/api/contact-export/users`. */
  path: string
  /** The exact JSON text that is sent as the body. */
  body: string
}

/** The canonical string both sides sign: LF-joined, no trailing LF. */
export const buildCanonicalString = async (
  input: AhachatSignatureInput,
): Promise<string> => {
  const bodyHash = toHex(
    await crypto.subtle.digest("SHA-256", encoder.encode(input.body)),
  )
  return [
    AHACHAT_SIGNATURE_VERSION,
    input.keyId,
    AHACHAT_SIGNATURE_AUDIENCE,
    AHACHAT_SIGNATURE_PURPOSE,
    String(input.timestamp),
    input.nonce,
    "POST",
    input.path,
    "application/json",
    bodyHash,
  ].join("\n")
}

export const signCanonicalString = async (
  hashKey: string,
  canonical: string,
): Promise<string> =>
  toHex(
    await crypto.subtle.sign(
      "HMAC",
      await importSigningKey(hashKey),
      encoder.encode(canonical),
    ),
  )

/** 16 random bytes as hex: the replay nonce. */
export const generateNonce = (): string =>
  toHex(crypto.getRandomValues(new Uint8Array(16)))

/** The five headers of a signed export request. */
export const buildSignedHeaders = async (
  key: AhachatExportKey,
  input: { path: string; body: string; timestamp?: number; nonce?: string },
): Promise<Record<string, string>> => {
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000)
  const nonce = input.nonce ?? generateNonce()
  const canonical = await buildCanonicalString({
    keyId: key.id,
    timestamp,
    nonce,
    path: input.path,
    body: input.body,
  })
  return {
    "X-Aha-Key-Id": key.id,
    "X-Aha-Api-Key": key.apiKey,
    "X-Aha-Timestamp": String(timestamp),
    "X-Aha-Nonce": nonce,
    "X-Aha-Signature": await signCanonicalString(key.hashKey, canonical),
  }
}
