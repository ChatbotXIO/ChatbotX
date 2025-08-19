import { z } from "zod"
import { openAIDefaultFn, openAISchema } from "./open-ai"
import { StepType } from "./step-action"

export const openAIGenerateTextAgentSchema = openAISchema.extend({
  stepType: z.literal(StepType.OPENAI_GENERATE_TEXT_AGENT),
  aiAgentId: z.string().cuid2(),
  userMessage: z.string(),
  resultCustomFieldId: z.string().cuid2(),
  aiTriggerIds: z.array(z.string().cuid2()),
  rememberConversation: z.boolean(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(250).max(4096),
})

export type OpenAIGenerateTextAgentSchema = z.infer<
  typeof openAIGenerateTextAgentSchema
>

export const openAIGenerateTextAgentDefaultFn =
  (): OpenAIGenerateTextAgentSchema => ({
    ...openAIDefaultFn(),
    stepType: StepType.OPENAI_GENERATE_TEXT_AGENT,
    aiAgentId: "",
    userMessage: "",
    resultCustomFieldId: "",
    aiTriggerIds: [],
    rememberConversation: true,
    temperature: 1.0,
    maxTokens: 250,
  })
