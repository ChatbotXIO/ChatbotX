import { z } from "zod"

export const updateAiTriggerSchema = z.object({
  name: z.string().min(1).max(255).trim(),
})

export type UpdateAiTriggerSchema = z.infer<typeof updateAiTriggerSchema>

export const updateAiTriggerBindSchema: [
  chatbotId: z.ZodString,
  triggerId: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type UpdateAiTriggerBindSchema = [chatbotId: string, triggerId: string]
