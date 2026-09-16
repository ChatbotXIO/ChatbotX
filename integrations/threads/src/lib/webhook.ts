const NON_HEX_REGEX = /[^0-9a-f]/iu

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
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || NON_HEX_REGEX.test(hex)) {
    return null
  }

  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16)
  }

  return bytes
}

export function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBytes = hexToBytes(left)
  const rightBytes = hexToBytes(right)

  if (!(leftBytes && rightBytes) || leftBytes.length !== rightBytes.length) {
    return false
  }

  let mismatchCount = 0
  for (let index = 0; index < leftBytes.length; index++) {
    mismatchCount += Number(leftBytes[index] !== rightBytes[index])
  }

  return mismatchCount === 0
}
