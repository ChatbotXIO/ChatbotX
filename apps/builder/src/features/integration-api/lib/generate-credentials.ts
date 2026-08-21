import { hashToken } from "./token-hash"

const TOKEN_PREFIX = "cbx_api_"
const TOKEN_BYTES = 32
const SIGNING_SECRET_BYTES = 32
// Must exceed TOKEN_PREFIX.length so the stored prefix carries
// distinguishing characters, not just the static literal.
const TOKEN_PREFIX_DISPLAY_LENGTH = 12

export type ApiChannelCredentials = {
  token: string
  tokenHash: string
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
 * Generates the raw bearer token shown once at creation/rotation time, plus
 * the values persisted instead of it: a SHA-256 hash for the auth lookup and
 * a short prefix for UI display.
 */
export const generateApiChannelToken =
  async (): Promise<ApiChannelCredentials> => {
    const token = `${TOKEN_PREFIX}${toBase64Url(randomBytes(TOKEN_BYTES))}`
    return {
      token,
      tokenHash: await hashToken(token),
      tokenPrefix: token.slice(0, TOKEN_PREFIX_DISPLAY_LENGTH),
    }
  }

/** Per-inbox HMAC secret used to sign outbound callback payloads. */
export const generateSigningSecret = (): string =>
  toHex(randomBytes(SIGNING_SECRET_BYTES))
