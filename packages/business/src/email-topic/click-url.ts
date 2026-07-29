import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import { z } from "zod"

// Click-tracking links live in marketing emails that may be opened long after
// they were sent, so the token is given a generous lifetime.
const TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000 // 1 year

const encryptedClickPayloadSchema = z.object({
  url: z.string(),
  exp: z.number(),
  workspaceId: z.string().optional(),
})
type EmailClickPayload = z.infer<typeof encryptedClickPayloadSchema>

/**
 * Seal a redirect destination into an authenticated token.
 *
 * The click route only redirects to URLs recovered from a token it can decrypt
 * and authenticate, so a forged or tampered `url` cannot be used as an open
 * redirect. The token is URL-safe (base64url) and can be passed as a query
 * param without further encoding.
 */
export async function signEmailClickUrl(
  url: string,
  workspaceId: string,
): Promise<string> {
  const encrypted = await encryptUtils.encryptObject({
    url,
    exp: Date.now() + TOKEN_TTL_MS,
    workspaceId,
  })
  return Buffer.from(JSON.stringify(encrypted)).toString("base64url")
}

/**
 * Recover and validate the redirect destination from a click token.
 *
 * Throws if the token is malformed, fails authentication (tampered), or has
 * expired. Callers must treat any throw as "do not trust this destination".
 */
export async function verifyEmailClickToken(
  token: string,
): Promise<EmailClickPayload> {
  const json = Buffer.from(token, "base64url").toString("utf8")
  const encrypted = encryptedDataSchema.parse(JSON.parse(json))
  const payload = await encryptUtils.decryptObject(
    encrypted,
    encryptedClickPayloadSchema,
  )
  if (payload.exp < Date.now()) {
    throw new Error("Email click token has expired")
  }
  return payload
}
