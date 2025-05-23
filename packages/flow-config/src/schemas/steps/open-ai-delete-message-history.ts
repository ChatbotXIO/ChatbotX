import { StepType } from "./step-action"
import { openAIDefaultFn, openAISchema } from "./open-ai"
import { z } from "zod"

export const openAIDeleteMessageHistorySchema = openAISchema.extend({
  stepType: z.literal(StepType.OpenAIDeleteMessageHistory),
})

export type OpenAIDeleteMessageHistorySchema = z.infer<
  typeof openAIDeleteMessageHistorySchema
>

export const openAIDeleteMessageHistoryDefaultFn =
  (): OpenAIDeleteMessageHistorySchema => ({
    ...openAIDefaultFn(),
    stepType: StepType.OpenAIDeleteMessageHistory,
  })
