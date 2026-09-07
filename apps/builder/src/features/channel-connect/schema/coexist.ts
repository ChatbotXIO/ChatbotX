import { z } from "zod"

/**
 * Shared request/response contract for the three coexist oRPC routes
 * (`integration-messenger`, `integration-instagram`, `integration-whatsapp`).
 * Coexist semantics stay unchanged (plan §2.9) — this file only removes the
 * three near-identical schema copies. The response keeps Instagram's
 * optional `runId` since Messenger/WhatsApp simply omit it.
 */

export const setCoexistRequestSchema = z.object({
  workspaceId: z.string(),
  integrationId: z.string(),
  enabled: z.boolean(),
  aiReadsSyncedHistory: z.boolean().optional().default(false),
})
export const setCoexistResponseSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), runId: z.string().optional() }),
  z.object({
    success: z.literal(false),
    reason: z.string().optional(),
    msg: z.string().optional(),
  }),
])
export type SetCoexistResponse = z.infer<typeof setCoexistResponseSchema>
