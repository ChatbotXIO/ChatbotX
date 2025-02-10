import { z } from "zod"

export const updateAiAssistantsSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  model: z.string(),
  prompt: z.string().min(1).max(255).trim(),
  temperature: z.string().min(1).trim(),
  attachmentIds: z.array(z.string()).optional(),
  aiTriggerIds: z.array(z.string()).optional(),
})

export type UpdateAiAssistantsSchema = z.infer<typeof updateAiAssistantsSchema>

export const updateAiAssistantsBindSchema: [
  chatbotId: z.ZodString,
  assistantId: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type UpdateAiAssistantsBindSchema = [
  chatbotId: string,
  assistantId: string,
]
