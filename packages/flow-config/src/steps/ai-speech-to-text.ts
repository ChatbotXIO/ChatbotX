import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const AISpeechToTextSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiSpeechToText),
  inputCfId: zodBigintAsString(),
  outputCfId: zodBigintAsString(),
})
export type AISpeechToTextSchema = z.infer<typeof AISpeechToTextSchema>

export const AISpeechToTextDefaultFn = (
  props?: Partial<AISpeechToTextSchema>,
): AISpeechToTextSchema => ({
  id: createId(),
  stepType: stepTypes.enum.aiSpeechToText,
  inputCfId: "",
  outputCfId: "",
  ...props,
})
