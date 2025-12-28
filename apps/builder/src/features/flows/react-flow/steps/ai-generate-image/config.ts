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
  { labelKey: "fields.quality.options.auto", value: "auto" },
  { labelKey: "fields.quality.options.hd", value: "hd" },
  { labelKey: "fields.quality.options.md", value: "md" },
  { labelKey: "fields.quality.options.ld", value: "ld" },
]

export const IMAGE_SIZE_OPTIONS = [
  { labelKey: "fields.size.options.auto", value: "auto" },
  { label: "Square - 1024x1024", value: "1024x1024" },
  { label: "Landscape - 1536x1024", value: "1536x1024" },
  { label: "Portrait - 1024x1536", value: "1024x1536" },
  { label: "256x256 (DALL\u00B7E 2)", value: "256x256" },
  { label: "512x512 (DALL\u00B7E 2)", value: "512x512" },
  { label: "1792x1024 (DALL\u00B7E 3)", value: "1792x1024" },
]
