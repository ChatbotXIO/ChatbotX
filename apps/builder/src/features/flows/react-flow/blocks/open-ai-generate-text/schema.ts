import { ActionType } from "@/features/flows/react-flow/action-type"
import {
  openAIDefaultFn,
  openAISchema,
} from "@/features/flows/react-flow/blocks/open-ai/schema"
import { z } from "zod"

export const openAIGenerateTextSchema = openAISchema.extend({
  actionType: z.literal(ActionType.OpenAIGenerateText),
  prompt: z.string().optional(),
  userMessage: z.string(),
  resultCustomFieldId: z.string().cuid2(),
  aiTriggerIds: z.array(z.string().cuid2()),
})
export type OpenAIGenerateTextSchema = z.infer<typeof openAIGenerateTextSchema>

export const openAIGenerateTextDefaultFn = (): OpenAIGenerateTextSchema => ({
  ...openAIDefaultFn(),
  actionType: ActionType.OpenAIGenerateText,
  prompt: "",
  userMessage: "",
  resultCustomFieldId: "",
  aiTriggerIds: [],
})
