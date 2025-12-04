import type { StepType } from "@aha.chat/flow-config"
import type { LucideIcon } from "lucide-react"
import type { useTranslations } from "next-intl"

export type MenuItem = {
  label: string
  icon: LucideIcon
  stepType: StepType | null
  children?: MenuItem[]
  provider?: "openai" | "gemini" | "claude" | "deepseek"
}

export type TranslationFn = ReturnType<typeof useTranslations>
