import type { AIGenerateImageQualityType } from "@chatbotx.io/flow-config"

const GPT_IMAGE_QUALITY_MAP: Record<
  AIGenerateImageQualityType,
  "auto" | "high" | "medium" | "low"
> = {
  auto: "auto",
  hd: "high",
  md: "medium",
  ld: "low",
}

const DALL_E_QUALITY_MAP: Record<
  AIGenerateImageQualityType,
  "auto" | "hd" | "standard"
> = {
  auto: "auto",
  hd: "hd",
  md: "standard",
  ld: "standard",
}

export function getOpenAIImageQuality(
  modelId: string,
  quality: AIGenerateImageQualityType,
) {
  return modelId.startsWith("gpt-image") || modelId.startsWith("chatgpt-image")
    ? GPT_IMAGE_QUALITY_MAP[quality]
    : DALL_E_QUALITY_MAP[quality]
}

const EDIT_IMAGE_QUALITY_MAP: Record<
  string,
  "auto" | "low" | "medium" | "high"
> = {
  auto: "auto",
  low: "low",
  medium: "medium",
  high: "high",
  ld: "low",
  md: "medium",
  hd: "high",
}

export function getOpenAIEditImageQuality(quality: string) {
  const normalizedQuality = EDIT_IMAGE_QUALITY_MAP[quality]

  if (!normalizedQuality) {
    throw new Error(`Unsupported OpenAI image quality: ${quality}`)
  }

  return normalizedQuality
}
