import { createHash, randomBytes } from "node:crypto"

const TOKEN_PREFIX = "cbx_api_"
const TOKEN_BYTES = 32
const SIGNING_SECRET_BYTES = 32
const TOKEN_PREFIX_DISPLAY_LENGTH = 8

export type ApiChannelCredentials = {
  token: string
  tokenHash: string
  tokenPrefix: string
}

const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex")

/**
 * Generates the raw bearer token shown once at creation/rotation time, plus
 * the values persisted instead of it: a SHA-256 hash for the auth lookup and
 * a short prefix for UI display.
 */
export const generateApiChannelToken = (): ApiChannelCredentials => {
  const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString("base64url")}`
  return {
    token,
    tokenHash: hashToken(token),
    tokenPrefix: token.slice(0, TOKEN_PREFIX_DISPLAY_LENGTH),
  }
}

/** Per-inbox HMAC secret used to sign outbound callback payloads. */
export const generateSigningSecret = (): string =>
  randomBytes(SIGNING_SECRET_BYTES).toString("hex")
