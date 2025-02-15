import { z } from "zod"
import { OpenAIModel } from "./index"

export const updateOpenAiSchema = z.object({
  prompt: z.string().min(1).max(255).optional(),
  model: z.nativeEnum(OpenAIModel).optional(),
  temperature: z.number().min(1).max(2).optional(),
  maxTokens: z.number().min(1).max(200).optional(),
  aiAgentId: z.string().cuid2().optional(),
  triggerIds: z.array(z.string().cuid2()).optional(),
})

export type UpdateOpenAISchema = z.infer<typeof updateOpenAiSchema>

export const updateOpenAIBindSchema: [
  chatbotId: z.ZodString,
  integrationId: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type UpdateOpenAIBindSchema = [chatbotId: string, integrationId: string]
