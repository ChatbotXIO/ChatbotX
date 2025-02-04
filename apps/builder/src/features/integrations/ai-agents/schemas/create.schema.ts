import { z } from "zod"

export const createAiAgentSchema = z.object({
  name: z.string().min(1).max(255).trim(),
})
export type CreateAiAgentSchema = z.infer<typeof createAiAgentSchema>

export const createAiAgentBindSchema: [
  chatbotId: z.ZodString,
  name: z.ZodNullable<z.ZodString>,
] = [z.string().cuid2(), z.string().nullable()]

export type CreateAiAgentBindSchema = [chatbotId: string, name: string | null]
