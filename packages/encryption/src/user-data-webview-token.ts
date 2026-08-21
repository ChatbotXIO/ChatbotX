import { z } from "zod"
import {
  signAppointmentToken,
  verifyAppointmentToken,
} from "./appointment-token-utils"

const TOKEN_AAD = "user-data-webview-token"
const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

export const userDataWebviewPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  conversationId: z.string().min(1),
  contactInboxId: z.string().min(1),
  contactId: z.string().min(1),
  channel: z.string().min(1),
  flowId: z.string().min(1),
  flowVersionId: z.string().min(1).optional(),
  stepId: z.string().min(1),
  nodeId: z.string().min(1),
  challengeId: z.string().min(1),
  outputFieldId: z.string().min(1),
  replyFormat: z.enum(["date", "datetime"]),
  expiresAt: z.number(),
})

export type UserDataWebviewPayload = z.infer<
  typeof userDataWebviewPayloadSchema
>

export async function signUserDataWebviewToken(
  payload: Omit<UserDataWebviewPayload, "expiresAt">,
  ttlMs = DEFAULT_TOKEN_TTL_MS,
): Promise<string> {
  return await signAppointmentToken(
    { ...payload, expiresAt: Date.now() + ttlMs },
    TOKEN_AAD,
  )
}

export async function verifyUserDataWebviewToken(
  token: string,
): Promise<UserDataWebviewPayload> {
  return await verifyAppointmentToken(
    token,
    TOKEN_AAD,
    userDataWebviewPayloadSchema,
  )
}
