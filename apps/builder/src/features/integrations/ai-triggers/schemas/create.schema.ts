import { z } from "zod"

const aiTriggerQuestionSchema = z.object({
  name: z.string().min(1).max(40).trim().optional(),
  fieldId: z.string().cuid2().optional(),
})

export const createAITriggerRequest = z.object({
  name: z.string().min(1).max(64).trim(),
  description: z.string().max(1000).trim().nullable(),
  questions: z.array(aiTriggerQuestionSchema),
  flowId: z.string().cuid2().nullable(),
  finalMessage: z.string().max(255).trim().nullable(),
})
export type CreateAITriggerRequest = z.infer<typeof createAITriggerRequest>
