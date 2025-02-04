import { z } from "zod"

export const createAiTriggerSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  description: z.string().min(1).max(255).trim(),
})
export type CreateAiTriggerSchema = z.infer<typeof createAiTriggerSchema>

export const createAiTriggerBindSchema: [
  chatbotId: z.ZodString,
  name: z.ZodNullable<z.ZodString>,
  description: z.ZodNullable<z.ZodString>,
] = [z.string().cuid2(), z.string().nullable(), z.string().nullable()]

export type CreateAiTriggerBindSchema = [
  chatbotId: string,
  name: string | null,
  description: string | null,
]
