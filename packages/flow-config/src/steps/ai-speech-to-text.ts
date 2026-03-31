import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const AISpeechToTextSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.aiSpeechToText),
  inputCfId: z.bigint(),
  outputCfId: z.bigint(),
})
export type AISpeechToTextSchema = z.infer<typeof AISpeechToTextSchema>

export const AISpeechToTextDefaultFn = (
  props?: Partial<AISpeechToTextSchema>,
): AISpeechToTextSchema => ({
  id: createId(),
  stepType: StepType.aiSpeechToText,
  inputCfId: "",
  outputCfId: "",
  ...props,
})
