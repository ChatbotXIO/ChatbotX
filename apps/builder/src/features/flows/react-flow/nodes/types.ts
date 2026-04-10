import type {
  ChooseChannelStepSchema,
  StepType,
} from "@chatbotx.io/flow-config"
import type { LucideIcon } from "lucide-react"
import type { useTranslations } from "next-intl"
import type { InboxResource } from "@/features/inboxes/schema/resource"
import type { WhatsappMessageTemplateResource } from "@/features/integration-whatsapp/message-templates/schema/resource"

export type MenuItem = {
  label: string
  icon: LucideIcon | React.FC<{ className?: string; fill?: string }>
  stepType: StepType | null
  children?: MenuItem[]
  // biome-ignore lint/suspicious/noExplicitAny: save additional props for onAdd
  props?: Record<string, any>
}

export type TranslationFn = ReturnType<typeof useTranslations>

export type FlowTemplateMenuData = {
  waTemplates?: WhatsappMessageTemplateResource[]
}

export type MenuData = {
  inboxes: InboxResource[]
  templates: FlowTemplateMenuData
  beforeStep: ChooseChannelStepSchema
}
