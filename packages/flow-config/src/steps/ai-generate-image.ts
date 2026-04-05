import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

const AIGenerateImageQuality = {
  Auto: "auto",
  High: "hd",
  Medium: "md",
  Low: "ld",
} as const

export const aiGenerateImageSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiGenerateImage),
  model: z.string().trim().min(1),
  prompt: z.string().trim().optional(),
  quality: z.enum(AIGenerateImageQuality),
  size: z.string().trim().min(1),
  outputCfId: zodBigintAsString(),
})

export type AIGenerateImageSchema = z.infer<typeof aiGenerateImageSchema>

export const AIGenerateImageDefaultFn = (
  props?: Partial<AIGenerateImageSchema>,
): AIGenerateImageSchema => ({
  id: createId(),
  stepType: stepTypes.enum.aiGenerateImage,
  model: "",
  prompt: "",
  size: "auto",
  quality: AIGenerateImageQuality.Auto,
  outputCfId: "",
  ...props,
})
