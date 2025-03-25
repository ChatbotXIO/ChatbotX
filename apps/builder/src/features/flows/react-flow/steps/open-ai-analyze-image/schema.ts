import { StepType } from "@/features/flows/react-flow/steps/step-action"
import {
  openAIDefaultFn,
  openAISchema,
} from "@/features/flows/react-flow/steps/open-ai/schema"
import { z } from "zod"

export const openAIAnalyzeImageSchema = openAISchema.extend({
  stepType: z.literal(StepType.OpenAIAnalyzeImage),
  imageCustomFieldId: z.string().cuid2(),
  prompt: z.string().min(1).max(1000),
  outputCustomFieldId: z.string().cuid2(),
})
export type OpenAIAnalyzeImageSchema = z.infer<typeof openAIAnalyzeImageSchema>

export const openAIAnalyzeImageDefaultFn = (): OpenAIAnalyzeImageSchema => ({
  ...openAIDefaultFn(),
  stepType: StepType.OpenAIAnalyzeImage,
  imageCustomFieldId: "",
  prompt: "",
  outputCustomFieldId: "",
})
