import { z } from "zod"

const aiTriggerQuestionSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  customFieldId: z.cuid2().optional(),
})

export const createAITriggerRequest = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(1000).nullable(),
  questions: z.array(aiTriggerQuestionSchema),
  flowId: z.cuid2().nullable(),
  finalMessage: z.string().trim().max(255).nullable(),
})
export type CreateAITriggerRequest = z.infer<typeof createAITriggerRequest>

export const updateAITriggerRequest = createAITriggerRequest.partial()
export type UpdateAITriggerRequest = z.infer<typeof updateAITriggerRequest>
