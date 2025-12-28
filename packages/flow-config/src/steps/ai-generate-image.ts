import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const AIGenerateImageQuality = {
  Auto: "auto",
  High: "hd",
  Medium: "md",
  Low: "ld",
} as const

export type AIGenerateImageQualityType =
  (typeof AIGenerateImageQuality)[keyof typeof AIGenerateImageQuality]

export const AIGenerateImageProvider = {
  OPENAI: "openai",
  GEMINI: "gemini",
} as const

export const IMAGE_PROVIDERS = AIGenerateImageProvider

export type AIGenerateImageProviderType =
  (typeof AIGenerateImageProvider)[keyof typeof AIGenerateImageProvider]

export const DEFAULT_IMAGE_MODEL_IDS: Record<
  AIGenerateImageProviderType,
  string
> = {
  openai: "gpt-image-1",
  gemini: "imagen-3.0-generate-001",
} as const

export const DEFAULT_IMAGE_MODELS = DEFAULT_IMAGE_MODEL_IDS

export const OPENAI_IMAGE_MODEL_NAMES = {
  GPT_IMAGE_1: "gpt-image-1",
  DALLE_3: "dall-e-3",
  DALLE_2: "dall-e-2",
} as const

export const OPENAI_DALLE3_QUALITY = {
  STANDARD: "standard",
  HD: "hd",
} as const

export type OpenAIDalle3QualityType =
  (typeof OPENAI_DALLE3_QUALITY)[keyof typeof OPENAI_DALLE3_QUALITY]

export const aiGenerateImageSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.aiGenerateImage),
  provider: z.enum([
    AIGenerateImageProvider.OPENAI,
    AIGenerateImageProvider.GEMINI,
  ]),
  model: z.string().trim().min(1),
  prompt: z.string().trim(),
  quality: z.enum(AIGenerateImageQuality),
  size: z.string().trim().min(1),
  outputCfId: z.string().trim().min(1),
})

export type AIGenerateImageSchema = z.infer<typeof aiGenerateImageSchema>

export const aiGenerateImageDefaultFn = (props?: {
  provider?: AIGenerateImageProviderType
}): AIGenerateImageSchema => {
  const provider = props?.provider ?? AIGenerateImageProvider.OPENAI

  return {
    id: createId(),
    stepType: StepType.aiGenerateImage,
    provider,
    model: DEFAULT_IMAGE_MODEL_IDS[provider],
    prompt: "",
    size: "auto",
    quality: AIGenerateImageQuality.Auto,
    outputCfId: "",
    ...props,
  }
}
