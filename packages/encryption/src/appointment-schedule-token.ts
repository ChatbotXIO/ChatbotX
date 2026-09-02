import { z } from "zod"
import {
  signAppointmentToken,
  verifyAppointmentToken,
} from "./appointment-token-utils"

const TOKEN_AAD = "appointment-schedule-token"
const DEFAULT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

export const appointmentSchedulePayloadSchema = z.object({
  appointmentId: z.string().min(1),
  workspaceId: z.string().min(1),
  contactId: z.string().min(1),
  conversationId: z.string().min(1).optional(),
  contactInboxId: z.string().min(1).optional(),
  flowVersionId: z.string().min(1).optional(),
  expiresAt: z.number(),
})

export type AppointmentSchedulePayload = z.infer<
  typeof appointmentSchedulePayloadSchema
>

export async function signAppointmentScheduleToken(
  payload: Omit<AppointmentSchedulePayload, "expiresAt">,
  ttlMs = DEFAULT_TOKEN_TTL_MS,
): Promise<string> {
  return await signAppointmentToken(
    { ...payload, expiresAt: Date.now() + ttlMs },
    TOKEN_AAD,
  )
}

export async function verifyAppointmentScheduleToken(
  token: string,
): Promise<AppointmentSchedulePayload> {
  return await verifyAppointmentToken(
    token,
    TOKEN_AAD,
    appointmentSchedulePayloadSchema,
  )
}
