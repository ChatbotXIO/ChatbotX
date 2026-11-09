import { z } from "zod"
import {
  signAppointmentToken,
  verifyAppointmentToken,
} from "./appointment-token-utils"

const TOKEN_AAD = "appointment-webview-token"
const DEFAULT_TOKEN_TTL_MS = 15 * 60 * 1000

/**
 * Booking links an agent creates from the inbox stay valid for 24 hours. The
 * link is a reusable bearer token (anyone holding it can book for the contact
 * until it expires), so the window is kept short.
 */
export const APPOINTMENT_INBOX_LINK_TTL_MS = 24 * 60 * 60 * 1000

export const appointmentWebviewPayloadSchema = z
  .object({
    /**
     * `flow` tokens are signed by the appointmentScheduling flow step and
     * resume the flow after submit; `inbox` tokens are booking links an agent
     * sends from the inbox and carry no flow context. Tokens signed before this
     * field existed are flow tokens.
     */
    source: z.enum(["flow", "inbox"]).default("flow"),
    mode: z
      .enum(["book", "selectAvailability", "selectAvailabilityRange"])
      .default("book"),
    workspaceId: z.string().min(1),
    calendarId: z.string().min(1),
    contactId: z.string().min(1),
    conversationId: z.string().min(1),
    contactInboxId: z.string().min(1),
    channel: z.string().min(1).optional(),
    flowId: z.string().min(1).optional(),
    flowVersionId: z.string().min(1).optional(),
    stepId: z.string().min(1).optional(),
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
  .superRefine((payload, ctx) => {
    if (payload.source === "flow") {
      for (const key of [
        "channel",
        "flowId",
        "flowVersionId",
        "stepId",
      ] as const) {
        if (!payload[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required for flow tokens`,
          })
        }
      }
      return
    }
    if (payload.mode !== "book") {
      ctx.addIssue({
        code: "custom",
        path: ["mode"],
        message: "Inbox tokens only support the book mode",
      })
    }
    if (payload.nodeId) {
      ctx.addIssue({
        code: "custom",
        path: ["nodeId"],
        message: "Inbox tokens cannot resume a flow",
      })
    }
  })

export type AppointmentWebviewPayload = z.infer<
  typeof appointmentWebviewPayloadSchema
>

/**
 * Signs the token and also returns the exact expiry written into it, so a
 * caller that reports the expiry never computes a second, drifting one.
 */
export async function signAppointmentWebviewTokenWithExpiry(
  payload: Omit<AppointmentWebviewPayload, "expiresAt">,
  ttlMs = DEFAULT_TOKEN_TTL_MS,
): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = Date.now() + ttlMs
  const token = await signAppointmentToken({ ...payload, expiresAt }, TOKEN_AAD)
  return { token, expiresAt: new Date(expiresAt) }
}

export async function signAppointmentWebviewToken(
  payload: Omit<AppointmentWebviewPayload, "expiresAt">,
  ttlMs = DEFAULT_TOKEN_TTL_MS,
): Promise<string> {
  const { token } = await signAppointmentWebviewTokenWithExpiry(payload, ttlMs)
  return token
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
