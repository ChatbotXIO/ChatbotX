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
