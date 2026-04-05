import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const AITextToSpeechSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiTextToSpeech),
  model: z.string().trim().min(1),
  message: z.string().trim().min(1),
  voiceType: z.string().trim().min(1),
  voiceTone: z.string().optional(),
  outputCfId: zodBigintAsString(),
})

export type AITextToSpeechSchema = z.infer<typeof AITextToSpeechSchema>

export const AITextToSpeechDefaultFn = (
  props?: Partial<AITextToSpeechSchema>,
): AITextToSpeechSchema => ({
  id: createId(),
  model: "",
  stepType: stepTypes.enum.aiTextToSpeech,
  message: "",
  voiceType: "",
  voiceTone: "",
  outputCfId: "",
  ...props,
})
