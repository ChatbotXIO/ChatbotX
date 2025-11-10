import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "../../step-action"
import {
  baseGenerateTextDefaultValues,
  baseGenerateTextFieldsSchema,
} from "../shared/generate-text"
import { GeminiModel, geminiSchema } from "./base"

// Re-export base types and schemas
export { GeminiModel, geminiSchema } from "./base"

export const geminiGenerateTextSchema = geminiSchema.extend({
  stepType: z.literal(StepType.GEMINI_GENERATE_TEXT),
  ...baseGenerateTextFieldsSchema,
})

export type GeminiGenerateTextSchema = z.infer<typeof geminiGenerateTextSchema>

export const geminiGenerateTextDefaultFn = (): GeminiGenerateTextSchema => ({
  id: createId(),
  stepType: StepType.GEMINI_GENERATE_TEXT,
  model: GeminiModel.Gemini25Pro,
  ...baseGenerateTextDefaultValues,
})

