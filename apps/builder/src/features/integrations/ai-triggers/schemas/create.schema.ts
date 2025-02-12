import { z } from "zod"

const aiTriggerQuestionsSchema = z
  .object({
    name: z.string().min(1).max(40).trim(),
    fieldId: z.string().cuid2(),
  })
  .optional()

export const createAITriggerSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  description: z.string().min(1).max(255).trim().optional(),
  questions: z.array(aiTriggerQuestionsSchema),
  flowId: z.string().min(1).max(255).trim().optional(),
  finalMessage: z.string().min(1).max(255).trim().optional(),
})
export type CreateAITriggerSchema = z.infer<typeof createAITriggerSchema>

export const createAITriggerBindSchema: [chatbotId: z.ZodString] = [
  z.string().cuid2(),
]

export type CreateAITriggerBindSchema = [chatbotId: string]
