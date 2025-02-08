import { z } from "zod"

const messageSchema = z.object({
  role: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
})

export const updateAiAgentSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  prompt: z.string().max(255).optional(),
  messages: z.array(messageSchema),
})

export type UpdateAiAgentSchema = z.infer<typeof updateAiAgentSchema>

export const updateAiAgentBindSchema: [
  chatbotId: z.ZodString,
  agentId: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type UpdateAiAgentBindSchema = [chatbotId: string, agentId: string]
