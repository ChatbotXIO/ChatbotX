import type { TokenHash } from "@chatbotx.io/database/partials"
import { hashToken } from "./token-hash"

const API_TOKEN_PREFIX = "cbx_api_"
const WORKSPACE_TOKEN_PREFIX = "cbx_ws_"
const TOKEN_BYTES = 32
const SIGNING_SECRET_BYTES = 32
// Must exceed the longest token prefix literal so the stored prefix carries
// distinguishing characters, not just the static literal.
const TOKEN_PREFIX_DISPLAY_LENGTH = 12

export type ApiChannelCredentials = {
  token: string
  tokenHash: TokenHash
  tokenPrefix: string
}

const BASE64_PADDING_PATTERN = /=+$/

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(BASE64_PADDING_PATTERN, "")

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")

const randomBytes = (length: number): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(length))

/**
 * URL-safe random string minted from CSPRNG bytes. The only sanctioned way to
 * generate bearer-credential material in the builder — Math.random()-backed
 * helpers (e.g. remeda's randomString) are predictable and must never be used
 * for secrets.
 */
const randomUrlSafeString = (byteLength: number): string =>
  toBase64Url(randomBytes(byteLength))

/**
 * Generates a bearer token shown once at creation/rotation time, plus the
 * values persisted instead of it: a SHA-256 hash for the auth lookup and a
 * short prefix for UI display.
 */
const generateBearerToken = async (
  prefix: string,
): Promise<ApiChannelCredentials> => {
  const token = `${prefix}${randomUrlSafeString(TOKEN_BYTES)}`
  return {
    token,
    tokenHash: await hashToken(token),
    tokenPrefix: token.slice(0, TOKEN_PREFIX_DISPLAY_LENGTH),
  }
}

export const generateApiChannelToken = (): Promise<ApiChannelCredentials> =>
  generateBearerToken(API_TOKEN_PREFIX)

/**
 * Server-minted workspace API token (Stripe-style: `cbx_ws_<random>`).
 * Verification is hash-lookup-only, so this format is never parsed back —
 * legacy tokens minted before this prefix existed keep authenticating.
 */
export const generateWorkspaceToken = (): Promise<ApiChannelCredentials> =>
  generateBearerToken(WORKSPACE_TOKEN_PREFIX)

/** Per-inbox HMAC secret used to sign outbound callback payloads. */
export const generateSigningSecret = (): string =>
  toHex(randomBytes(SIGNING_SECRET_BYTES))
