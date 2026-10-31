const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const BASE = BigInt(CHARS.length)

export function encodeBase62(input: string): string {
  let num = BigInt(input)

  if (num === 0n) {
    return CHARS[0]
  }
  if (num < 0n) {
    throw new Error("Input must be a non-negative integer string")
  }

  let result = ""

  while (num > 0n) {
    const remainder = num % BASE
    result = CHARS[Number(remainder)] + result
    num /= BASE
  }
  return result
}

export function decodeBase62(input: string): string {
  let result = 0n

  for (const char of input) {
    const index = CHARS.indexOf(char)

    if (index === -1) {
      throw new Error(`Invalid character in string: ${char}`)
    }

    result = result * BASE + BigInt(index)
  }
  return result.toString()
}

/** URL-safe base64 of `text` (Unicode-safe: `btoa` alone rejects non-Latin1). */
export function encodeBase64UrlText(text: string): string {
  return btoa(encodeURIComponent(text))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

/** Inverse of {@link encodeBase64UrlText}; throws on malformed input. */
export function decodeBase64UrlText(encoded: string): string {
  return decodeURIComponent(
    atob(encoded.replaceAll("-", "+").replaceAll("_", "/")),
  )
}
