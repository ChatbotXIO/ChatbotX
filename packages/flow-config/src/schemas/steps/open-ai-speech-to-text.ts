import { StepType } from "./step-action"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const openAISpeechToTextSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.OPENAI_SPEECH_TO_TEXT),
  audioCustomFieldId: z.string().cuid2(),
  resultCustomFieldId: z.string().cuid2(),
})
export type OpenAISpeechToTextSchema = z.infer<typeof openAISpeechToTextSchema>

export const openAISpeechToTextDefaultFn = (): OpenAISpeechToTextSchema => ({
  id: createId(),
  stepType: StepType.OPENAI_SPEECH_TO_TEXT,
  audioCustomFieldId: "",
  resultCustomFieldId: "",
})
