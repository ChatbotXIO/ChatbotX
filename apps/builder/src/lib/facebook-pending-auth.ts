import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import { cookies } from "next/headers"

export const FB_MESSENGER_PENDING_AUTH_COOKIE = "fb_messenger_pending_auth"
export const FB_INSTAGRAM_PENDING_AUTH_COOKIE = "fb_instagram_pending_auth"
export const FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE =
  "fb_instagram_facebook_pending_auth"
export const FB_PENDING_AUTH_MAX_AGE = 600 // seconds — 10 minutes

export type FacebookAuthCallback = {
  userToken: string
  /** Graph identity of the authorizing user; absent when the lookup failed. */
  userId?: string
  userName?: string
  /** Provider-hosted profile picture URL (not yet uploaded to storage). */
  userAvatarUrl?: string
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

/** Read and decrypt the pending-auth cookie for a channel; null if missing, expired, or tampered. */
export async function readPendingAuth(
  cookieName: string,
): Promise<FacebookAuthCallback | null> {
  const token = (await cookies()).get(cookieName)?.value
  return token ? decryptAuth<FacebookAuthCallback>(token) : null
}
