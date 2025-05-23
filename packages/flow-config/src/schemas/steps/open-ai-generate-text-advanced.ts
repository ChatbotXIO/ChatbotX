import { StepType } from "./step-action"
import { openAIDefaultFn, openAISchema } from "./open-ai"
import { z } from "zod"

export const openAIGenerateTextAdvancedSchema = openAISchema.extend({
  stepType: z.literal(StepType.OpenAIGenerateTextAdvanced),
  prompt: z.string().optional(),
  userMessage: z.string(),
  resultCustomFieldId: z.string().cuid2(),
  aiTriggerIds: z.array(z.string().cuid2()),
  rememberConversation: z.boolean(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(250).max(4096),
})

export type OpenAIGenerateTextAdvancedSchema = z.infer<
  typeof openAIGenerateTextAdvancedSchema
>

export const openAIGenerateTextAdvancedDefaultFn =
  (): OpenAIGenerateTextAdvancedSchema => ({
    ...openAIDefaultFn(),
    stepType: StepType.OpenAIGenerateTextAdvanced,
    prompt: "",
    userMessage: "",
    resultCustomFieldId: "",
    aiTriggerIds: [],
    rememberConversation: true,
    temperature: 1.0,
    maxTokens: 250,
  })
