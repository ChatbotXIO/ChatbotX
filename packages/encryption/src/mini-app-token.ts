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

const RESUME_TOKEN_AAD = "mini-app-resume-token"

export const miniAppResumeTokenPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  contactId: z.string().min(1),
  miniAppId: z.string().min(1),
  conversationId: z.string().min(1),
  contactInboxId: z.string().min(1),
  /** The flow button the link was sent on, as `encodeButtonPayload` builds it. */
  buttonPayload: z.string().min(1),
  expiresAt: z.number(),
})

export type MiniAppResumeTokenPayload = z.infer<
  typeof miniAppResumeTokenPayloadSchema
>

/**
 * Signs where a flow continues once the contact submits the Mini App opened
 * from an "Open Mini App" button: the button (and so its edge) plus the
 * conversation it was sent in.
 */
export async function signMiniAppResumeToken(
  payload: Omit<MiniAppResumeTokenPayload, "expiresAt">,
  ttlMs = DEFAULT_TOKEN_TTL_MS,
): Promise<string> {
  return await signAppointmentToken(
    { ...payload, expiresAt: Date.now() + ttlMs },
    RESUME_TOKEN_AAD,
  )
}

export async function verifyMiniAppResumeToken(
  token: string,
): Promise<MiniAppResumeTokenPayload> {
  return await verifyAppointmentToken(
    token,
    RESUME_TOKEN_AAD,
    miniAppResumeTokenPayloadSchema,
  )
}
