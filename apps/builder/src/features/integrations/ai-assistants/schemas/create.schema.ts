import { z } from "zod"

export const createAiAssistantsSchema = z.object({
  name: z.string().min(1).max(255).trim(),
})

export type CreateAiAssistantsSchema = z.infer<typeof createAiAssistantsSchema>

export const createAiAssistantsBindSchema: [
  chatbotId: z.ZodString,
  name: z.ZodNullable<z.ZodString>,
] = [z.string().cuid2(), z.string().nullable()]

export type CreateAiAssistantsBindSchema = [
  chatbotId: string,
  name: string | null,
]
