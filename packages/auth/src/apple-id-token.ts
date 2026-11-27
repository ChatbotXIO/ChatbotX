import { createRemoteJWKSet, jwtVerify } from "jose"

const APPLE_JWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
)

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

export const createAppleIdTokenVerifier =
  (bundleIds: string[]) =>
  async (token: string, nonce?: string): Promise<boolean> => {
    if (!nonce) {
      return false
    }

    try {
      const { payload } = await jwtVerify(token, APPLE_JWKS, {
        issuer: "https://appleid.apple.com",
        audience: bundleIds,
        algorithms: ["RS256"],
        maxTokenAge: "1h",
        requiredClaims: ["iss", "sub", "aud", "exp", "iat"],
        clockTolerance: 30,
      })
      const tokenNonce = payload.nonce
      // The client sends SHA256(nonce) to Apple and the raw nonce to us. A raw
      // nonce claim is readable in the token itself, so accepting it would void
      // replay protection (deliberately stricter than better-auth's default).
      return (
        typeof tokenNonce === "string" &&
        tokenNonce === (await sha256Hex(nonce))
      )
    } catch {
      return false
    }
  }
