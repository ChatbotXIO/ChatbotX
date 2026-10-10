import { z } from "zod"
import {
  signAppointmentToken,
  verifyAppointmentToken,
} from "./appointment-token-utils"

const TOKEN_AAD = "mini-app-token"
// Long enough for a contact to open a Mini App link days after it was sent.
const DEFAULT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const miniAppTokenPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  contactId: z.string().min(1),
  expiresAt: z.number(),
})

export type MiniAppTokenPayload = z.infer<typeof miniAppTokenPayloadSchema>

/**
 * Signs the contact identity a public Mini App link carries, so a submission
 * can be attributed to the contact the link was sent to — never to an id a
 * visitor typed into the URL.
 */
export async function signMiniAppToken(
  payload: Omit<MiniAppTokenPayload, "expiresAt">,
  ttlMs = DEFAULT_TOKEN_TTL_MS,
): Promise<string> {
  return await signAppointmentToken(
    { ...payload, expiresAt: Date.now() + ttlMs },
    TOKEN_AAD,
  )
}

export async function verifyMiniAppToken(
  token: string,
): Promise<MiniAppTokenPayload> {
  return await verifyAppointmentToken(
    token,
    TOKEN_AAD,
    miniAppTokenPayloadSchema,
  )
}
