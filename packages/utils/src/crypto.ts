/// <reference lib="dom" />

/**
 * UTF-8 encode → SHA-256 → lowercase hex. The exact digest Meta's Conversions
 * API customer-information matching expects for `em`/`ph`/`fn`/`ln`/
 * `external_id` — see `packages/business/src/meta-conversions/
 * hash-user-data.ts` for the normalize-then-hash mapper built on this
 * primitive.
 */
export async function sha256Hex(payload: string): Promise<string> {
  const enc = new TextEncoder()
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(payload))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function hmacSha256Hex(
  secret: string,
  payload: string,
): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  let different = 0
  for (let i = 0; i < a.length; i++) {
    different += a.charCodeAt(i) === b.charCodeAt(i) ? 0 : 1
  }
  return different === 0
}

const DEFAULT_HMAC_SIGNATURE_PREFIX = "sha256="

export type VerifyHmacSha256SignatureInput = {
  rawBody: Uint8Array
  secret: string
  signatureHeader: string | null | undefined
  /** Defaults to `"sha256="`, matching `X-Hub-Signature-256`. */
  prefix?: string
}

/**
 * Verifies a Meta-style sha256=<hex> webhook signature (e.g.
 * X-Hub-Signature-256). HMAC is computed over the exact rawBody bytes, never
 * a re-encoded string, so the digest matches Meta's. Uses Web Crypto rather
 * than node:crypto so it stays importable from edge-bundled subpaths.
 */
export async function verifyHmacSha256Signature(
  input: VerifyHmacSha256SignatureInput,
): Promise<boolean> {
  const prefix = input.prefix ?? DEFAULT_HMAC_SIGNATURE_PREFIX
  if (!input.signatureHeader?.startsWith(prefix)) {
    return false
  }

  const provided = input.signatureHeader.slice(prefix.length).toLowerCase()

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  // Copy into a fresh ArrayBuffer-backed view: a bare `Uint8Array` widens to
  // `Uint8Array<ArrayBufferLike>` (possibly SharedArrayBuffer), which
  // `crypto.subtle.sign`'s `BufferSource` param rejects.
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new Uint8Array(input.rawBody),
  )
  const expected = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

  return (
    provided.length === expected.length &&
    timingSafeStringEqual(provided, expected)
  )
}
