import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const AISpeechToTextSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.aiSpeechToText),
  inputCfId: z.cuid2(),
  outputCfId: z.cuid2(),
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
