import { z } from "zod"

const messageSchema = z.object({
  role: z.enum(["user", "agent"]).default("user"),
  content: z.string(),
})

export const updateAiAgentSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  json_builder: z
    .object({
      system: z.string().optional(),
      messages: z.array(messageSchema).optional(),
    })
    .optional(),
})

export type UpdateAiAgentSchema = z.infer<typeof updateAiAgentSchema>

export const updateAiAgentBindSchema: [
  chatbotId: z.ZodString,
  agentId: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type UpdateAiAgentBindSchema = [chatbotId: string, agentId: string]
