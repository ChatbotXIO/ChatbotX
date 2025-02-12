import { z } from "zod"

export const createAIAgentSchema = z.object({
  name: z.string().min(1).max(255).trim(),
})
export type CreateAIAgentSchema = z.infer<typeof createAIAgentSchema>

export const createAIAgentBindSchema: [
  chatbotId: z.ZodString,
  name: z.ZodNullable<z.ZodString>,
] = [z.string().cuid2(), z.string().nullable()]

export type CreateAIAgentBindSchema = [chatbotId: string, name: string | null]
