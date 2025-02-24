import { OpenAIMessageRole } from "@/features/integration-openai/schemas"
import { z } from "zod"

export const messageSchema = z.object({
  role: z.nativeEnum(OpenAIMessageRole).optional(),
  content: z.string().min(1).optional(),
})
export type MessageSchema = z.infer<typeof messageSchema>

export const updateAIAgentSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  prompt: z.string().max(1000).optional(),
  messages: z.array(messageSchema),
})

export type UpdateAIAgentSchema = z.infer<typeof updateAIAgentSchema>

export const updateAIAgentBindSchema: [
  chatbotId: z.ZodString,
  agentId: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type UpdateAIAgentBindSchema = [chatbotId: string, agentId: string]
