import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const openAISpeechToTextSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.OPENAI_SPEECH_TO_TEXT),
  inputCustomFieldId: z.string().cuid2(),
  ouputCustomFieldId: z.string().cuid2(),
})
export type OpenAISpeechToTextSchema = z.infer<typeof openAISpeechToTextSchema>

export const openAISpeechToTextDefaultFn = (): OpenAISpeechToTextSchema => ({
  id: createId(),
  stepType: StepType.OPENAI_SPEECH_TO_TEXT,
  inputCustomFieldId: "",
  ouputCustomFieldId: "",
})
