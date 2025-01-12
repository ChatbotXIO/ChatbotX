import { ActionType } from "@/features/flows/react-flow/action-type"
import {
  openAIDefaultValue,
  openAISchema,
} from "@/features/flows/react-flow/blocks/open-ai/schema"
import { z } from "zod"

export const openAIGenerateTextAssistantSchema = openAISchema.extend({
  actionType: z.enum([ActionType.OpenAIGenerateTextAssistant]),
  assistantId: z.string().min(1).max(100).cuid2(),
})

export type OpenAIGenerateTextAssistantSchema = z.infer<
  typeof openAIGenerateTextAssistantSchema
>

export const openAIGenerateTextAssistantDefaultValue =
  (): OpenAIGenerateTextAssistantSchema => ({
    ...openAIDefaultValue(),
    actionType: ActionType.OpenAIGenerateTextAssistant,
    assistantId: "",
    buttons: [],
  })
