import {
  AIGenerateImageQuality,
  IMAGE_AUTO_VALUE,
  ImageAspectRatio,
} from "@aha.chat/flow-config"
import type { LucideIcon } from "lucide-react"
import { BotIcon, BrainIcon, CpuIcon, ZapIcon } from "lucide-react"

export type AIProviderConfig = {
  icon: LucideIcon
  iconColor: string
  modelLabelKey: string
  placeholderKey: string
}

export const AI_PROVIDER_CONFIGS: Record<
  "claude" | "openai" | "gemini" | "deepseek",
  AIProviderConfig
> = {
  claude: {
    icon: CpuIcon,
    iconColor: "text-orange-500",
    modelLabelKey: "fields.claude.label",
    placeholderKey: "fields.placeholders.selectModelClaude",
  },
  openai: {
    icon: BotIcon,
    iconColor: "text-yellow-500",
    modelLabelKey: "fields.openai.label",
    placeholderKey: "fields.placeholders.selectModelOpenAI",
  },
  gemini: {
    icon: BrainIcon,
    iconColor: "text-blue-500",
    modelLabelKey: "fields.gemini.label",
    placeholderKey: "fields.placeholders.selectModelGemini",
  },
  deepseek: {
    icon: ZapIcon,
    iconColor: "text-purple-500",
    modelLabelKey: "fields.deepseek.label",
    placeholderKey: "fields.placeholders.selectModelDeepseek",
  },
} as const

export const IMAGE_QUALITY_OPTIONS = [
  {
    labelKey: "fields.quality.options.auto",
    value: AIGenerateImageQuality.Auto,
  },
  { labelKey: "fields.quality.options.hd", value: AIGenerateImageQuality.High },
  {
    labelKey: "fields.quality.options.md",
    value: AIGenerateImageQuality.Medium,
  },
  { labelKey: "fields.quality.options.ld", value: AIGenerateImageQuality.Low },
]

export const IMAGE_SIZE_OPTIONS = [
  { labelKey: "fields.size.options.auto", value: IMAGE_AUTO_VALUE },
  { label: "Square - 1024x1024", value: "1024x1024" },
  { label: "Landscape - 1536x1024", value: "1536x1024" },
  { label: "Portrait - 1024x1536", value: "1024x1536" },
  { label: "256x256 (DALL\u00B7E 2)", value: "256x256" },
  { label: "512x512 (DALL\u00B7E 2)", value: "512x512" },
  { label: "1792x1024 (DALL\u00B7E 3)", value: "1792x1024" },
]

export const GEMINI_ASPECT_RATIO_OPTIONS = [
  { labelKey: "fields.size.options.auto", value: IMAGE_AUTO_VALUE },
  { label: ImageAspectRatio["1:1"], value: ImageAspectRatio["1:1"] },
  { label: ImageAspectRatio["3:4"], value: ImageAspectRatio["3:4"] },
  { label: ImageAspectRatio["4:3"], value: ImageAspectRatio["4:3"] },
  { label: ImageAspectRatio["9:16"], value: ImageAspectRatio["9:16"] },
  { label: ImageAspectRatio["16:9"], value: ImageAspectRatio["16:9"] },
]
