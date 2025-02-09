import { ActionType } from "@/features/flows/react-flow/action-type"
import {
  openAIDefaultValue,
  openAISchema,
} from "@/features/flows/react-flow/blocks/open-ai/schema"
import { z } from "zod"

export const openAIAnalyzeImageSchema = openAISchema.extend({
  actionType: z.literal(ActionType.OpenAIAnalyzeImage),
  imageCustomFieldId: z.string().cuid2(),
  prompt: z.string().min(1).max(1000),
  outputCustomFieldId: z.string().cuid2(),
})
export type OpenAIAnalyzeImageSchema = z.infer<typeof openAIAnalyzeImageSchema>

export const openAIAnalyzeImageDefaultValue = (): OpenAIAnalyzeImageSchema => ({
  ...openAIDefaultValue(),
  actionType: ActionType.OpenAIAnalyzeImage,
  imageCustomFieldId: "",
  prompt: "",
  outputCustomFieldId: "",
})
