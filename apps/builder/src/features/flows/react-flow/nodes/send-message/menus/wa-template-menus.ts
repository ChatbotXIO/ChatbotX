import { stepTypes } from "@chatbotx.io/flow-config"
import { MessageSquareIcon } from "lucide-react"
import type { MenuData, MenuItem, TranslationFn } from "../../types"
import type { ListInboxesResponse } from "@/features/inboxes/schema/action"

export const waTemplateMenus = (
  t: TranslationFn,
  menuData?: MenuData,
  inbox?: ListInboxesResponse["data"][number],
): MenuItem[] => {
  let templates = menuData?.templates.waTemplates ?? []

  if (inbox) {
    templates = templates.filter(
      (template) => template.integrationWhatsapp?.inboxId === inbox.id,
    )
  }

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
    stepType: stepTypes.enum.sendWaTemplateMessage,
    props: {
      template: {
        id: template.id,
        integrationWhatsappId: template.integrationWhatsappId,
        inboxId: template.integrationWhatsapp?.inboxId,
      },
    },
  }))
}
