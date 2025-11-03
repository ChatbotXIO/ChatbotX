import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const AITextToSpeechSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.aiTextToSpeech),
  model: z.string().trim().min(1),
  message: z.string().trim().min(1),
  voiceType: z.string().trim().min(1),
  voiceTone: z.string().optional(),
  outputCfId: z.cuid2(),
})

export type AITextToSpeechSchema = z.infer<typeof AITextToSpeechSchema>

export const AITextToSpeechDefaultFn = (
  props?: Partial<AITextToSpeechSchema>,
): AITextToSpeechSchema => ({
  id: createId(),
  model: "",
  stepType: StepType.aiTextToSpeech,
  message: "",
  voiceType: "",
  voiceTone: "",
  outputCfId: "",
  ...props,
})
