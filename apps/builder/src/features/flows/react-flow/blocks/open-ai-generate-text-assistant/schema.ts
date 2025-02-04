import { ActionType } from "@/features/flows/react-flow/action-type"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const openAIGenerateTextAssistantSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.OpenAIGenerateTextAssistant),
  aiAssistantId: z.string().cuid2(),
  userMessage: z.string(),
  resultCustomFieldId: z.string().cuid2(),
})
export type OpenAIGenerateTextAssistantSchema = z.infer<
  typeof openAIGenerateTextAssistantSchema
>

export const openAIGenerateTextAssistantDefaultValue =
  (): OpenAIGenerateTextAssistantSchema => ({
    id: createId(),
    actionType: ActionType.OpenAIGenerateTextAssistant,
    aiAssistantId: "",
    userMessage: "",
    resultCustomFieldId: "",
  })
