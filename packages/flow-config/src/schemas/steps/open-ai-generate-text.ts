import { z } from "zod"
import { openAIDefaultFn, openAISchema } from "./open-ai"
import { StepType } from "./step-action"

export const openAIGenerateTextSchema = openAISchema.extend({
  stepType: z.literal(StepType.OPENAI_GENERATE_TEXT),
  prompt: z.string().optional(),
  userMessage: z.string().optional(),
  resultCustomFieldId: z.union([z.cuid2(), z.literal("")]).optional(),
  tools: z.array(z.string()).optional(),
  aiTriggerIds: z.array(z.cuid2()),
  rememberConversation: z.boolean(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(250).max(4096),
})

export type OpenAIGenerateTextSchema = z.infer<typeof openAIGenerateTextSchema>

export const openAIGenerateTextDefaultFn = (): OpenAIGenerateTextSchema => ({
  ...openAIDefaultFn(),
  stepType: StepType.OPENAI_GENERATE_TEXT,
  prompt: "",
  userMessage: "",
  resultCustomFieldId: undefined,
  tools: [],
  aiTriggerIds: [],
  rememberConversation: true,
  temperature: 1.0,
  maxTokens: 250,
})
