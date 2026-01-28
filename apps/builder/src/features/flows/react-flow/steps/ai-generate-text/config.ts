import type { AIProvider } from "@aha.chat/flow-config"
import { SiClaude } from "@icons-pack/react-simple-icons"
import type { LucideIcon } from "lucide-react"
import { BotIcon, BrainIcon, ZapIcon } from "lucide-react"

export type AIProviderConfig = {
  icon: LucideIcon
  iconColor: string
  modelLabelKey: string
}

export const AI_PROVIDER_CONFIGS: Record<AIProvider, AIProviderConfig> = {
  claude: {
    icon: SiClaude,
    iconColor: "text-orange-500",
    modelLabelKey: "fields.claude.label",
  },
  openai: {
    icon: BotIcon,
    iconColor: "text-yellow-500",
    modelLabelKey: "fields.openai.label",
  },
  gemini: {
    icon: BrainIcon,
    iconColor: "text-blue-500",
    modelLabelKey: "fields.gemini.label",
  },
  deepseek: {
    icon: ZapIcon,
    iconColor: "text-purple-500",
    modelLabelKey: "fields.deepseek.label",
  },
} as const
