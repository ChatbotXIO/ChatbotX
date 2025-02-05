import { ActionType } from "@/features/flows/react-flow/action-type"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const openAISpeechToTextSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.OpenAISpeechToText),
  audioCustomFieldId: z.string().cuid2(),
  resultCustomFieldId: z.string().cuid2(),
})
export type OpenAISpeechToTextSchema = z.infer<typeof openAISpeechToTextSchema>

export const openAISpeechToTextDefaultValue = (): OpenAISpeechToTextSchema => ({
  id: createId(),
  actionType: ActionType.OpenAISpeechToText,
  audioCustomFieldId: "",
  resultCustomFieldId: "",
})
