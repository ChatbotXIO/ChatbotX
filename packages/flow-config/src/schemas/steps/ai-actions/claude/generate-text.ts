import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "../../../../steps/step-action"
import {
  baseGenerateTextDefaultValues,
  baseGenerateTextFieldsSchema,
} from "../shared/generate-text"
import { ClaudeModel, claudeSchema } from "./base"

// Re-export base types and schemas
export { ClaudeModel, claudeSchema } from "./base"

export const claudeGenerateTextSchema = claudeSchema.extend({
  stepType: z.literal(StepType.claudeGenerateText),
  ...baseGenerateTextFieldsSchema,
})

export type ClaudeGenerateTextSchema = z.infer<typeof claudeGenerateTextSchema>

export const claudeGenerateTextDefaultFn = (): ClaudeGenerateTextSchema => ({
  id: createId(),
  stepType: StepType.claudeGenerateText,
  model: ClaudeModel.Claude35Sonnet,
  ...baseGenerateTextDefaultValues,
})
