/**
 * Single hashing implementation shared by token generation
 * (generate-credentials.ts) and bearer verification
 * (middlewares/channel-api-token-auth.ts) so the two can never drift.
 * Web Crypto only — safe in both Node and edge runtimes.
 */
export const hashToken = async (token: string): Promise<string> => {
  const data = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
