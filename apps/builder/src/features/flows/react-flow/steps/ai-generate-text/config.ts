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
