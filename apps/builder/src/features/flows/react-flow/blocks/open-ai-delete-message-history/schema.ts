import { ActionType } from "@/features/flows/react-flow/action-type"
import {
  openAIDefaultValue,
  openAISchema,
} from "@/features/flows/react-flow/blocks/open-ai/schema"
import { z } from "zod"

export const openAIDeleteMessageHistorySchema = openAISchema.extend({
  actionType: z.literal(ActionType.OpenAIDeleteMessageHistory),
})

export type OpenAIDeleteMessageHistorySchema = z.infer<
  typeof openAIDeleteMessageHistorySchema
>

export const openAIDeleteMessageHistoryDefaultValue =
  (): OpenAIDeleteMessageHistorySchema => ({
    ...openAIDefaultValue(),
    actionType: ActionType.OpenAIDeleteMessageHistory,
  })
