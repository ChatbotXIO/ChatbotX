import { StepType } from "./step-action"
import { openAIDefaultFn, openAISchema } from "./open-ai"
import { z } from "zod"

export const openAIGenerateTextSchema = openAISchema.extend({
  stepType: z.literal(StepType.OpenAIGenerateText),
  prompt: z.string().optional(),
  userMessage: z.string(),
  resultCustomFieldId: z.string().cuid2(),
  aiTriggerIds: z.array(z.string().cuid2()),
})
export type OpenAIGenerateTextSchema = z.infer<typeof openAIGenerateTextSchema>

export const openAIGenerateTextDefaultFn = (): OpenAIGenerateTextSchema => ({
  ...openAIDefaultFn(),
  stepType: StepType.OpenAIGenerateText,
  prompt: "",
  userMessage: "",
  resultCustomFieldId: "",
  aiTriggerIds: [],
})
