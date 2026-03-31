import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

const AIGenerateImageQuality = {
  Auto: "auto",
  High: "hd",
  Medium: "md",
  Low: "ld",
} as const

export const aiGenerateImageSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.aiGenerateImage),
  model: z.string().trim().min(1),
  prompt: z.string().trim().optional(),
  quality: z.enum(AIGenerateImageQuality),
  size: z.string().trim().min(1),
  outputCfId: z.bigint(),
})

export type AIGenerateImageSchema = z.infer<typeof aiGenerateImageSchema>

export const AIGenerateImageDefaultFn = (
  props?: Partial<AIGenerateImageSchema>,
): AIGenerateImageSchema => ({
  id: createId(),
  stepType: StepType.aiGenerateImage,
  model: "",
  prompt: "",
  size: "auto",
  quality: AIGenerateImageQuality.Auto,
  outputCfId: "",
  ...props,
})
