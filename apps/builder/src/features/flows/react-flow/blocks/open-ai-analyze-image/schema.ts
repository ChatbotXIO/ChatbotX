import { ActionType } from "@/features/flows/react-flow/action-type"
import {
  openAIDefaultValue,
  openAISchema,
} from "@/features/flows/react-flow/blocks/open-ai/schema"
import { z } from "zod"

export const openAIAnalyzeImageSchema = openAISchema.extend({
  actionType: z.enum([ActionType.OpenAIAnalyzeImage]),
  imageId: z.string().min(1).max(100).cuid2(),
  prompt: z.string().min(1).max(255),
})

export type OpenAIAnalyzeImageSchema = z.infer<typeof openAIAnalyzeImageSchema>

export const openAIAnalyzeImageDefaultValue = (): OpenAIAnalyzeImageSchema => ({
  ...openAIDefaultValue(),
  actionType: ActionType.OpenAIAnalyzeImage,
  imageId: "",
  prompt: "",
  buttons: [],
})
