import { z } from "zod"
import {
  signAppointmentToken,
  verifyAppointmentToken,
} from "./appointment-token-utils"

const TOKEN_AAD = "appointment-cancel-token"
const DEFAULT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
const POSTBACK_PREFIX = "appointment_cancel:"

export const appointmentCancelPayloadSchema = z.object({
  appointmentId: z.string().min(1),
  workspaceId: z.string().min(1),
  contactId: z.string().min(1),
  conversationId: z.string().min(1).optional(),
  contactInboxId: z.string().min(1).optional(),
  flowVersionId: z.string().min(1).optional(),
  expiresAt: z.number(),
})

export type AppointmentCancelPayload = z.infer<
  typeof appointmentCancelPayloadSchema
>

export async function signAppointmentCancelToken(
  payload: Omit<AppointmentCancelPayload, "expiresAt">,
  ttlMs = DEFAULT_TOKEN_TTL_MS,
): Promise<string> {
  return await signAppointmentToken(
    { ...payload, expiresAt: Date.now() + ttlMs },
    TOKEN_AAD,
  )
}

export async function verifyAppointmentCancelToken(
  token: string,
): Promise<AppointmentCancelPayload> {
  return await verifyAppointmentToken(
    token,
    TOKEN_AAD,
    appointmentCancelPayloadSchema,
  )
}

export const buildAppointmentCancelPostback = (token: string): string =>
  `${POSTBACK_PREFIX}${token}`

export const parseAppointmentCancelPostback = (
  payload: string | null | undefined,
): string | null => {
  if (!payload?.startsWith(POSTBACK_PREFIX)) {
    return null
  }
  return payload.slice(POSTBACK_PREFIX.length) || null
}

export async function verifyAppointmentCancelPostback(
  payload: string,
): Promise<AppointmentCancelPayload> {
  const token = parseAppointmentCancelPostback(payload)
  if (!token) {
    throw new Error("Invalid appointment cancel postback")
  }
  return await verifyAppointmentCancelToken(token)
}
