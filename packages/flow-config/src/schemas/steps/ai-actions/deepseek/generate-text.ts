import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "../../../../steps/step-action"
import {
  baseGenerateTextDefaultValues,
  baseGenerateTextFieldsSchema,
} from "../shared/generate-text"
import { DeepseekModel, deepseekSchema } from "./base"

// Re-export base types and schemas
export { DeepseekModel, deepseekSchema } from "./base"

export const deepseekGenerateTextSchema = deepseekSchema.extend({
  stepType: z.literal(StepType.deepseekGenerateText),
  ...baseGenerateTextFieldsSchema,
})

export type DeepseekGenerateTextSchema = z.infer<
  typeof deepseekGenerateTextSchema
>

export const deepseekGenerateTextDefaultFn =
  (): DeepseekGenerateTextSchema => ({
    id: createId(),
    stepType: StepType.deepseekGenerateText,
    model: DeepseekModel.DeepSeekV25,
    ...baseGenerateTextDefaultValues,
  })
