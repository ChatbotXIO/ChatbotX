import { z } from "zod"
import { openAIDefaultFn, openAISchema } from "./base"
import {
  baseGenerateTextDefaultValues,
  baseGenerateTextFieldsSchema,
} from "../shared/generate-text"
import { StepType } from "../../step-action"

export const openAIGenerateTextSchema = openAISchema.extend({
  stepType: z.literal(StepType.OPENAI_GENERATE_TEXT),
  ...baseGenerateTextFieldsSchema,
  aiTriggerIds: z.array(z.cuid2()).default([]),
})

export type OpenAIGenerateTextSchema = z.infer<typeof openAIGenerateTextSchema>

export const openAIGenerateTextDefaultFn = (): OpenAIGenerateTextSchema => ({
  ...openAIDefaultFn(),
  stepType: StepType.OPENAI_GENERATE_TEXT,
  ...baseGenerateTextDefaultValues,
  aiTriggerIds: [],
})

