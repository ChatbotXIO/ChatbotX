import type { StepType } from "@chatbotx.io/flow-config"
import type { LucideIcon } from "lucide-react"
import type { useTranslations } from "next-intl"

export type MenuItem = {
  label: string
  icon: LucideIcon | React.FC<{ className?: string; fill?: string }>
  stepType: StepType | null
  children?: MenuItem[]
  // biome-ignore lint/suspicious/noExplicitAny: save additional props for onAdd
  props?: Record<string, any>
}

export type TranslationFn = ReturnType<typeof useTranslations>
