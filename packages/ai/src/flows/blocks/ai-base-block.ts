import z from "zod"

export const baseAISchema = z.object({
  id: z.string().cuid2(),
  model: z.string().trim().min(1),
})

export const baseAISettingsSchema = z.object({
  temperature: z.number().min(0).max(2),
  maxOutputTokens: z.number().int().min(1).max(4096),
})
