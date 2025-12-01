import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "../../../../steps/step-action"
import {
  baseGenerateTextDefaultValues,
  baseGenerateTextFieldsSchema,
} from "../shared/generate-text"
import { GeminiModel, geminiSchema } from "./base"

// Re-export base types and schemas
export { GeminiModel, geminiSchema } from "./base"

export const geminiGenerateTextSchema = geminiSchema.extend({
  stepType: z.literal(StepType.geminiGenerateText),
  ...baseGenerateTextFieldsSchema,
})

export type GeminiGenerateTextSchema = z.infer<typeof geminiGenerateTextSchema>

export const geminiGenerateTextDefaultFn = (): GeminiGenerateTextSchema => ({
  id: createId(),
  stepType: StepType.geminiGenerateText,
  model: GeminiModel.Gemini25Pro,
  ...baseGenerateTextDefaultValues,
})
