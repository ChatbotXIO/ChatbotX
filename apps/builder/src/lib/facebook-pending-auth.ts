import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"

export const FB_MESSENGER_PENDING_AUTH_COOKIE = "fb_messenger_pending_auth"
export const FB_INSTAGRAM_PENDING_AUTH_COOKIE = "fb_instagram_pending_auth"
export const FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE =
  "fb_instagram_facebook_pending_auth"
export const FB_PENDING_AUTH_MAX_AGE = 600 // seconds — 10 minutes

export type FacebookAuthCallback = {
  userToken: string
  workspaceId: string
  referer: string
  version: string
  expiresAt: number
}

export async function encryptAuth(data: unknown): Promise<string> {
  const encrypted = await encryptUtils.encryptObject(data)
  return Buffer.from(JSON.stringify(encrypted)).toString("base64url")
}

export async function decryptAuth<T extends { expiresAt: number }>(
  token: string,
): Promise<T | null> {
  try {
    const raw = JSON.parse(Buffer.from(token, "base64url").toString())
    const encrypted = encryptedDataSchema.parse(raw)
    const text = await encryptUtils.decryptText(encrypted)
    const data = JSON.parse(text) as T
    if (Date.now() > data.expiresAt) {
      return null
    }
    return data
  } catch {
    return null
  }
}
