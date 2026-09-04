import { z } from "zod"
import {
  signAppointmentToken,
  verifyAppointmentToken,
} from "./appointment-token-utils"

const TOKEN_AAD = "minigame-referral-token"
// Deliberately much longer than the play token's 24h: a play link is minted
// per message send, but an invite link gets pasted into a group chat and
// clicked days later. The referral cookie's `maxAge` matches this.
const DEFAULT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

export const minigameReferralPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  minigameId: z.string().min(1),
  referrerContactId: z.string().min(1),
  expiresAt: z.number(),
})

export type MinigameReferralPayload = z.infer<
  typeof minigameReferralPayloadSchema
>

/**
 * Signs the identity a public minigame *invite* link carries.
 *
 * This is deliberately a different token family from
 * `signMinigamePlayToken`, not the same token reused: both the public play
 * page and `playMinigameAction` treat a valid play token as proof of
 * identity — they resolve its `contactInboxId` to a contact and then play,
 * decrement draws, tag, and DM prize messages as that contact. A sharer who
 * pasted their play token into an invite link would hand every recipient the
 * ability to play as them. `verifyAppointmentToken` rejects on an AAD
 * mismatch before it even decrypts, so the two families are non-interchange-
 * able at the crypto layer rather than only by convention.
 *
 * The payload carries no `contactInboxId` (an invite never needs to send a
 * message as the referrer, and its absence makes the token structurally
 * unusable as an identity) and does carry `minigameId`, so a cookie copied
 * into another minigame's slot fails validation instead of crediting the
 * wrong game.
 */
export async function signMinigameReferralToken(
  payload: Omit<MinigameReferralPayload, "expiresAt">,
  ttlMs = DEFAULT_TOKEN_TTL_MS,
): Promise<string> {
  return await signAppointmentToken(
    { ...payload, expiresAt: Date.now() + ttlMs },
    TOKEN_AAD,
  )
}

export async function verifyMinigameReferralToken(
  token: string,
): Promise<MinigameReferralPayload> {
  return await verifyAppointmentToken(
    token,
    TOKEN_AAD,
    minigameReferralPayloadSchema,
  )
}
