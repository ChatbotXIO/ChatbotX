import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const aiTriggerQuestionSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  customFieldId: zodBigintAsString().optional(),
})

export const createAITriggerRequest = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(1000).nullable(),
  questions: z.array(aiTriggerQuestionSchema),
  flowId: zodBigintAsString().nullable(),
  finalMessage: z.string().trim().max(255).nullable(),
})
export type CreateAITriggerRequest = z.infer<typeof createAITriggerRequest>

export const updateAITriggerRequest = createAITriggerRequest.partial()
export type UpdateAITriggerRequest = z.infer<typeof updateAITriggerRequest>
