import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

import { zodFieldReference } from "../field-reference"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const aiSpeechToTextSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiSpeechToText),
  provider: z.literal("openai"),
  model: z.string().trim().min(1),
  inputFieldId: z.string().trim().min(1),
  outputFieldId: zodFieldReference(),
  states: z.tuple([successStateSchema, errorStateSchema]).optional(),
})
export type AISpeechToTextSchema = z.infer<typeof aiSpeechToTextSchema>

export const AISpeechToTextDefaultFn = (
  props?: Partial<AISpeechToTextSchema>,
): AISpeechToTextSchema => ({
  id: createId(),
  provider: "openai",
  model: "whisper-1",
  inputFieldId: "",
  outputFieldId: "",
  ...props,
  stepType: stepTypes.enum.aiSpeechToText,
  states: [successStateDefaultFn(), errorStateDefaultFn()],
})
