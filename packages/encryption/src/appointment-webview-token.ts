import { z } from "zod"
import {
  signAppointmentToken,
  verifyAppointmentToken,
} from "./appointment-token-utils"

const TOKEN_AAD = "appointment-webview-token"
const DEFAULT_TOKEN_TTL_MS = 15 * 60 * 1000

export const appointmentWebviewPayloadSchema = z.object({
  mode: z
    .enum(["book", "selectAvailability", "selectAvailabilityRange"])
    .default("book"),
  workspaceId: z.string().min(1),
  calendarId: z.string().min(1),
  contactId: z.string().min(1),
  conversationId: z.string().min(1),
  contactInboxId: z.string().min(1),
  channel: z.string().min(1),
  flowId: z.string().min(1),
  flowVersionId: z.string().min(1),
  stepId: z.string().min(1),
  nodeId: z.string().min(1).optional(),
  selectedDateCustomFieldId: z.string().min(1).optional(),
  startDateCustomFieldId: z.string().min(1).optional(),
  endDateCustomFieldId: z.string().min(1).optional(),
  resultCustomFieldId: z.string().min(1).optional(),
  resultUsedByAI: z.boolean().optional(),
  availabilityStartAt: z.iso.datetime().optional(),
  availabilityEndAt: z.iso.datetime().optional(),
  expiresAt: z.number(),
})

export type AppointmentWebviewPayload = z.infer<
  typeof appointmentWebviewPayloadSchema
>

export async function signAppointmentWebviewToken(
  payload: Omit<AppointmentWebviewPayload, "expiresAt">,
  ttlMs = DEFAULT_TOKEN_TTL_MS,
): Promise<string> {
  return await signAppointmentToken(
    { ...payload, expiresAt: Date.now() + ttlMs },
    TOKEN_AAD,
  )
}

export async function verifyAppointmentWebviewToken(
  token: string,
): Promise<AppointmentWebviewPayload> {
  return await verifyAppointmentToken(
    token,
    TOKEN_AAD,
    appointmentWebviewPayloadSchema,
  )
}
