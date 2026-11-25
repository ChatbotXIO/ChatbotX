/** Stable JSON: object keys sorted, so the same request always hashes the same. */
const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

const HEX_RADIX = 16
const HEX_BYTE_WIDTH = 2

/**
 * SHA-256 of the normalised request, in hex. Web Crypto, not `node:crypto`: this
 * module is reached by the builder's router graph, which must stay Edge-safe.
 */
export const requestHash = async (request: unknown): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stableStringify(request)),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(HEX_RADIX).padStart(HEX_BYTE_WIDTH, "0"),
  ).join("")
}
