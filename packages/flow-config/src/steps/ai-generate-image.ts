import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { aiProviders, defaultImageModelIds } from "./ai-shared"
import { StepType } from "./step-action"

export const AIGenerateImageQuality = {
  Auto: "auto",
  High: "hd",
  Medium: "md",
  Low: "ld",
} as const

export const ImageAspectRatio = {
  "1:1": "1:1",
  "4:3": "4:3",
  "3:4": "3:4",
  "16:9": "16:9",
  "9:16": "9:16",
} as const

export type ImageAspectRatioType = keyof typeof ImageAspectRatio

export const IMAGE_DEFAULT_MIME_TYPE = "image/png"
export const IMAGE_DEFAULT_EXTENSION = "png"
export const IMAGE_BASE64_ENCODING = "base64"
export const IMAGE_AUTO_VALUE = "auto"

export const getAIGeneratedImagePath = (chatbotId: string, fileName: string) =>
  `chatbots/${chatbotId}/generated-images/${fileName}`

export type AIGenerateImageQualityType =
  (typeof AIGenerateImageQuality)[keyof typeof AIGenerateImageQuality]

export const AIGenerateImageProvider = {
  openai: aiProviders.openai,
  gemini: aiProviders.gemini,
} as const

export const IMAGE_PROVIDERS = AIGenerateImageProvider

export type AIGenerateImageProviderType =
  (typeof AIGenerateImageProvider)[keyof typeof AIGenerateImageProvider]

export const DEFAULT_IMAGE_MODEL_IDS = defaultImageModelIds

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
    AIGenerateImageProvider.openai,
    AIGenerateImageProvider.gemini,
  ]),
  model: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  quality: z.enum(
    Object.values(AIGenerateImageQuality) as [string, ...string[]],
  ),
  size: z.string().trim().min(1),
  outputCfId: z.string().trim().min(1),
})

export type AIGenerateImageSchema = z.infer<typeof aiGenerateImageSchema>

export const aiGenerateImageDefaultFn = (props?: {
  provider?: AIGenerateImageProviderType
}): AIGenerateImageSchema => {
  const provider = props?.provider ?? AIGenerateImageProvider.openai

  return {
    id: createId(),
    stepType: StepType.aiGenerateImage,
    provider,
    model: DEFAULT_IMAGE_MODEL_IDS[provider],
    prompt: "",
    size: IMAGE_AUTO_VALUE,
    quality: AIGenerateImageQuality.Auto,
    outputCfId: "",
    ...props,
  }
}
