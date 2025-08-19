import { z } from "zod"
import { openAIDefaultFn, openAISchema } from "./open-ai"
import { StepType } from "./step-action"

export const openAIGenerateTextAdvancedSchema = openAISchema.extend({
  stepType: z.literal(StepType.OPENAI_GENERATE_TEXT_ADVANCED),
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
    stepType: StepType.OPENAI_GENERATE_TEXT_ADVANCED,
    prompt: "",
    userMessage: "",
    resultCustomFieldId: "",
    aiTriggerIds: [],
    rememberConversation: true,
    temperature: 1.0,
    maxTokens: 250,
  })
