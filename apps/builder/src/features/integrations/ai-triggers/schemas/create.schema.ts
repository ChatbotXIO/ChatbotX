import { z } from "zod"

const aiTriggerQuestionsSchema = z.object({
  name: z.string().min(1).max(40).trim(),
  fieldId: z.string().cuid2(),
})

export const createAITriggerSchema = z.object({
  name: z.string().min(1).max(64).trim(),
  description: z.string().min(1).max(200).trim().optional(),
  questions: z.array(aiTriggerQuestionsSchema),
  flowId: z.string().cuid2().optional(),
  finalMessage: z.string().min(1).max(255).trim().optional(),
})
export type CreateAITriggerSchema = z.infer<typeof createAITriggerSchema>
