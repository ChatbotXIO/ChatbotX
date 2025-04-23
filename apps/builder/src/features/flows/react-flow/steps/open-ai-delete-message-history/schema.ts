import { StepType } from "@/features/flows/react-flow/steps/step-action"
import {
  openAIDefaultFn,
  openAISchema,
} from "@/features/flows/react-flow/steps/open-ai/schema"
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
