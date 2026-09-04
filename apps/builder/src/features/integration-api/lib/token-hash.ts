import type { TokenHash } from "@chatbotx.io/database/partials"

/**
 * Single hashing implementation for all API bearer tokens — channel API keys
 * and workspace API tokens — so generation and verification can never drift.
 * Web Crypto only — safe in both Node and edge runtimes.
 */
export const hashToken = async (token: string): Promise<TokenHash> => {
  const data = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("") as TokenHash
}
