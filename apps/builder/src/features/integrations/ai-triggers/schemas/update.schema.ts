import { z } from "zod"
import { aiTriggerQuestionsSchema } from "@/features/integrations/ai-triggers/schemas/create.schema"

export const updateAiTriggerSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  description: z.string().min(1).max(255).trim().optional(),
  questions: z.array(aiTriggerQuestionsSchema).optional(),
  flowId: z.string().min(1).max(255).trim().optional(),
  finalMessage: z.string().min(1).max(255).trim().optional(),
})

export type UpdateAiTriggerSchema = z.infer<typeof updateAiTriggerSchema>

export const updateAiTriggerBindSchema: [
  chatbotId: z.ZodString,
  triggerId: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type UpdateAiTriggerBindSchema = [chatbotId: string, triggerId: string]
