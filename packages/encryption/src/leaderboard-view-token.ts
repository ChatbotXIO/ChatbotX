import { z } from "zod"
import {
  signAppointmentToken,
  verifyAppointmentToken,
} from "./appointment-token-utils"

const TOKEN_AAD = "leaderboard-view-token"
/** Campaigns run for weeks, and the link sits in chat history — keep it valid for 30 days. */
const DEFAULT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

export const leaderboardViewPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  contactId: z.string().min(1),
  contactInboxId: z.string().min(1),
  expiresAt: z.number(),
})

export type LeaderboardViewPayload = z.infer<
  typeof leaderboardViewPayloadSchema
>

/**
 * Signs the viewer identity a public leaderboard link carries, so the page
 * can show "my rank" and a personal referral link without exposing a raw
 * contact id anyone could swap for another contact's.
 */
export async function signLeaderboardViewToken(
  payload: Omit<LeaderboardViewPayload, "expiresAt">,
  ttlMs = DEFAULT_TOKEN_TTL_MS,
): Promise<string> {
  return await signAppointmentToken(
    { ...payload, expiresAt: Date.now() + ttlMs },
    TOKEN_AAD,
  )
}

export async function verifyLeaderboardViewToken(
  token: string,
): Promise<LeaderboardViewPayload> {
  return await verifyAppointmentToken(
    token,
    TOKEN_AAD,
    leaderboardViewPayloadSchema,
  )
}
