import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

import { stepTypes } from "./step-action"

export const aiGenerateImageQuality = z.enum(["auto", "hd", "md", "ld"])
export type AIGenerateImageQualityType = z.infer<typeof aiGenerateImageQuality>

export const imageAspectRatio = z.enum([
  "auto",
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
])
export type ImageAspectRatioType = z.infer<typeof imageAspectRatio>

export const IMAGE_AUTO_VALUE = imageAspectRatio.enum.auto

export const IMAGE_BASE64_ENCODING = "base64" as const

export const IMAGE_DEFAULT_EXTENSION = "png" as const

export const IMAGE_DEFAULT_MIME_TYPE = "image/png" as const

export const defaultModels = {
  openai: "dall-e-3",
  gemini: "gemini-3.1-flash-image-preview",
} as const

export const aiGenerateImageProvider = z.enum(["openai", "gemini"])
export type AIGenerateImageProvider = z.infer<typeof aiGenerateImageProvider>

export const aiGenerateImageSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiGenerateImage),
  provider: aiGenerateImageProvider,
  model: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  quality: aiGenerateImageQuality,
  size: z.string().trim().min(1),
  outputCfId: z.string().trim().min(1),
})

export type AIGenerateImageSchema = z.infer<typeof aiGenerateImageSchema>

export const getAIGeneratedImagePath = (
  workspaceId: string,
  conversationId: string,
  fileName: string,
): string =>
  `public/space/${workspaceId}/conversations/${conversationId}/${fileName}`

export const aiGenerateImageDefaultFn = (
  props: Partial<AIGenerateImageSchema> = {},
): AIGenerateImageSchema => {
  const provider = props.provider ?? "openai"
  const model: string =
    props.model ?? defaultModels[provider as keyof typeof defaultModels]

  return {
    id: createId(),
    provider,
    model,
    prompt: "",
    size: imageAspectRatio.enum.auto,
    quality: aiGenerateImageQuality.enum.auto,
    outputCfId: "",
    ...props,
    stepType: stepTypes.enum.aiGenerateImage,
  }
}
