import { StepType } from "@aha.chat/flow-config"
import { MessageSquareIcon } from "lucide-react"
import type { FlowActionState } from "../../../stores/flow-action-store"
import type { MenuItem, TranslationFn } from "../../types"

type Template = {
  id: string
  name: string
  language: string
}

export const waTemplateMenus = (
  t: TranslationFn,
  menuData?: FlowActionState,
): MenuItem[] => {
  const templates = menuData?.data?.["wa.templates"] as Template[] | undefined

  if (!templates || templates.length === 0) {
    return [
      {
        label: t("flows.actions.noTemplatesAvailable"),
        icon: MessageSquareIcon,
        stepType: null,
      },
    ]
  }

  return templates.map((template) => ({
    label: `${template.name} (${template.language})`,
    icon: MessageSquareIcon,
    stepType: StepType.sendWaTemplateMessage,
    props: {
      template: {
        id: template.id,
        name: template.name,
        languageCode: template.language,
        params: {},
      },
    },
  }))
}
