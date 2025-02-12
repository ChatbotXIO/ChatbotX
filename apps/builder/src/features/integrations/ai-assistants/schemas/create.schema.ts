import { z } from "zod"

export const createAIAssistantsSchema = z.object({
  name: z.string().min(1).max(255).trim(),
})

export type CreateAIAssistantsSchema = z.infer<typeof createAIAssistantsSchema>

export const createAIAssistantsBindSchema: [
  chatbotId: z.ZodString,
  name: z.ZodNullable<z.ZodString>,
] = [z.string().cuid2(), z.string().nullable()]

export type CreateAIAssistantsBindSchema = [
  chatbotId: string,
  name: string | null,
]
