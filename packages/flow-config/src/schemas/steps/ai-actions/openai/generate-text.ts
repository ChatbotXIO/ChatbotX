import { z } from "zod"
import { StepType } from "../../../../steps/step-action"
import {
  baseGenerateTextDefaultValues,
  baseGenerateTextFieldsSchema,
} from "../shared/generate-text"
import { openAIDefaultFn, openAISchema } from "./base"

export const openAIGenerateTextSchema = openAISchema.extend({
  stepType: z.literal(StepType.openaiGenerateText),
  ...baseGenerateTextFieldsSchema,
  aiTriggerIds: z.array(z.cuid2()).default([]),
})

export type OpenAIGenerateTextSchema = z.infer<typeof openAIGenerateTextSchema>

export const openAIGenerateTextDefaultFn = (): OpenAIGenerateTextSchema => ({
  ...openAIDefaultFn(),
  stepType: StepType.openaiGenerateText,
  ...baseGenerateTextDefaultValues,
  aiTriggerIds: [],
})
