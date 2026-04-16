import { z } from "zod"
import { FlowEventType } from "./types"

const basePayloadSchema = z.object({
  chatbotId: z.string(),
  contactId: z.string(),
  conversationId: z.string(),
  channel: z.string(),
  occurredAt: z.date(),
})

export const clickedPayloadSchema = basePayloadSchema.extend({
  flowId: z.string(),
  buttonId: z.string().optional(),
  nodeId: z.string().optional(),
  broadcastId: z.string().optional(),
  clickType: z.enum(["button", "quick_reply"]),
})

export const flowEventSchemas = {
  [FlowEventType.CLICKED]: clickedPayloadSchema,
} as const
