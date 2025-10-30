import { AIMessageRole } from "@aha.chat/database/types"
import { z } from "zod"

export const messageSchema = z.object({
  role: z.enum(AIMessageRole).optional(),
  content: z.string().min(1).optional(),
})
export type MessageSchema = z.infer<typeof messageSchema>

export const updateAIAgentRequest = z.object({
  name: z.string().trim().min(1).max(255),
  prompt: z.string().max(1000).nullable(),
  messages: z.array(messageSchema),
})
export type UpdateAIAgentRequest = z.infer<typeof updateAIAgentRequest>
