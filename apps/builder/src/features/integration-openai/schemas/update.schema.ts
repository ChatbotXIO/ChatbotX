import { z } from "zod"
import { OpenAIModel } from "./index"

export const updateOpenAiSchema = z.object({
  prompt: z.string().min(1).max(255).optional(),
  model: z.string().optional(),
  temperature: z
    .string()
    .optional()
    .default("0.1")
    .refine((v: string) => {
      const num = Number(v)
      return !Number.isNaN(num) && num >= 0.1 && num <= 2
    }),
  maxTokens: z
    .string()
    .optional()
    .default("200")
    .refine((v: string) => {
      const num = Number(v)
      return !Number.isNaN(num) && num >= 1 && num <= 200
    }),
  aiAgentId: z.string().cuid2().optional(),
  triggerIds: z.array(z.string().cuid2()).optional(),
})

export type UpdateOpenAISchema = z.infer<typeof updateOpenAiSchema>

export const updateOpenAIBindSchema: [
  chatbotId: z.ZodString,
  integrationId: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type UpdateOpenAIBindSchema = [chatbotId: string, integrationId: string]
