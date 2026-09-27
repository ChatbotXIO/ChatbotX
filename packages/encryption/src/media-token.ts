import { z } from "zod"
import {
  signAppointmentToken,
  verifyAppointmentToken,
} from "./appointment-token-utils"

const TOKEN_AAD = "media"
const DEFAULT_TOKEN_TTL_MS = 60 * 60 * 1000

export const mediaTokenClaimsSchema = z.object({
  workspaceId: z.string().min(1),
  kind: z.enum(["attachment", "avatar"]),
  refId: z.string().min(1),
  // Parent message createdAt (epoch ms) for attachment tokens. Lets the proxy
  // route the shard lookup directly to the time window that holds the row on a
  // sharded deployment, instead of scanning a fixed recent-history range. Signed
  // so it cannot be tampered with; optional for avatar tokens and backward
  // compatible with tokens minted before it existed.
  // Capped at the maximum valid ECMAScript time value so a corrupt claim can
  // never reconstruct an Invalid Date downstream.
  messageCreatedAt: z
    .number()
    .int()
    .nonnegative()
    .max(8_640_000_000_000_000)
    .optional(),
})

export const mediaTokenPayloadSchema = mediaTokenClaimsSchema.extend({
  expiresAt: z.number(),
})

export type MediaTokenClaims = z.infer<typeof mediaTokenClaimsSchema>
export type MediaTokenPayload = z.infer<typeof mediaTokenPayloadSchema>

export async function signMediaToken(
  claims: MediaTokenClaims,
  ttlMs = DEFAULT_TOKEN_TTL_MS,
): Promise<string> {
  return await signAppointmentToken(
    { ...claims, expiresAt: Date.now() + ttlMs },
    TOKEN_AAD,
  )
}

export async function verifyMediaToken(
  token: string,
): Promise<MediaTokenPayload> {
  return await verifyAppointmentToken(token, TOKEN_AAD, mediaTokenPayloadSchema)
}
