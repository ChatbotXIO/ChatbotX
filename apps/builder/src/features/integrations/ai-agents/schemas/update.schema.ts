import { OpenAIMessageRole } from "@/features/integration-openai/schemas"
import { z } from "zod"

export const messageSchema = z.object({
  role: z.nativeEnum(OpenAIMessageRole).optional(),
  content: z.string().min(1).optional(),
})
export type MessageSchema = z.infer<typeof messageSchema>

export const updateAIAgentRequest = z.object({
  name: z.string().min(1).max(255).trim(),
  prompt: z.string().max(1000).nullable(),
  messages: z.array(messageSchema),
})
export type UpdateAIAgentRequest = z.infer<typeof updateAIAgentRequest>
