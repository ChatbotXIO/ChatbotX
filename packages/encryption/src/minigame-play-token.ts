import { z } from "zod"
import {
  signAppointmentToken,
  verifyAppointmentToken,
} from "./appointment-token-utils"

const TOKEN_AAD = "minigame-play-token"
const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

export const minigamePlayPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  contactId: z.string().min(1),
  contactInboxId: z.string().min(1),
  expiresAt: z.number(),
})

export type MinigamePlayPayload = z.infer<typeof minigamePlayPayloadSchema>

/**
 * Signs the identity a public minigame play link carries, replacing the raw
 * `ContactInbox.sourceId` the link previously exposed as a plain `userId`
 * query param — anyone who knew/guessed another contact's sourceId could
 * otherwise play, and be messaged, as them.
 */
export async function signMinigamePlayToken(
  payload: Omit<MinigamePlayPayload, "expiresAt">,
  ttlMs = DEFAULT_TOKEN_TTL_MS,
): Promise<string> {
  return await signAppointmentToken(
    { ...payload, expiresAt: Date.now() + ttlMs },
    TOKEN_AAD,
  )
}

export async function verifyMinigamePlayToken(
  token: string,
): Promise<MinigamePlayPayload> {
  return await verifyAppointmentToken(
    token,
    TOKEN_AAD,
    minigamePlayPayloadSchema,
  )
}
