import { StepType } from "@/features/flows/react-flow/steps/step-action"
import {
  openAIDefaultFn,
  openAISchema,
} from "@/features/flows/react-flow/steps/open-ai/schema"
import { z } from "zod"

export const openAIGenerateTextAgentSchema = openAISchema.extend({
  stepType: z.literal(StepType.OpenAIGenerateTextAgent),
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
    stepType: StepType.OpenAIGenerateTextAgent,
    aiAgentId: "",
    userMessage: "",
    resultCustomFieldId: "",
    aiTriggerIds: [],
    rememberConversation: true,
    temperature: 1.0,
    maxTokens: 250,
  })
