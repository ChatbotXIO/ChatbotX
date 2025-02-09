import { z } from "zod"

const aiTriggerQuestionsSchema = z
  .object({
    name: z.string().min(1).max(40).trim(),
    fieldId: z.string().cuid2(),
  })
  .optional()

export const createAiTriggerSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  description: z.string().min(1).max(255).trim().optional(),
  questions: z.array(aiTriggerQuestionsSchema),
  flowId: z.string().min(1).max(255).trim().optional(),
  finalMessage: z.string().min(1).max(255).trim().optional(),
})
export type CreateAiTriggerSchema = z.infer<typeof createAiTriggerSchema>

export const createAiTriggerBindSchema: [chatbotId: z.ZodString] = [
  z.string().cuid2(),
]

export type CreateAiTriggerBindSchema = [chatbotId: string]
