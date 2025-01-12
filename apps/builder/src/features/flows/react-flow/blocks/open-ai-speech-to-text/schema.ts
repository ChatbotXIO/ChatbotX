import { ActionType } from "@/features/flows/react-flow/action-type"
import {
  openAIDefaultValue,
  openAISchema,
} from "@/features/flows/react-flow/blocks/open-ai/schema"
import { z } from "zod"

export const openAISpeechToTextSchema = openAISchema.extend({
  actionType: z.enum([ActionType.OpenAISpeechToText]),
  audioId: z.string().min(1).max(100).cuid2(),
})

export type OpenAISpeechToTextSchema = z.infer<typeof openAISpeechToTextSchema>

export const openAISpeechToTextDefaultValue = (): OpenAISpeechToTextSchema => ({
  ...openAIDefaultValue(),
  actionType: ActionType.OpenAISpeechToText,
  audioId: "",
  buttons: [],
})
