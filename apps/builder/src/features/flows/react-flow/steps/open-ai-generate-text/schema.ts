import { StepType } from "@/features/flows/react-flow/steps/step-action"
import {
  openAIDefaultFn,
  openAISchema,
} from "@/features/flows/react-flow/steps/open-ai/schema"
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
