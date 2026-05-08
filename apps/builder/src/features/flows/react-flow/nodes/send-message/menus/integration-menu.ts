import type { ChannelType } from "@chatbotx.io/database/partials"
import { type StepType, stepTypes } from "@chatbotx.io/flow-config"
import { GlobeIcon, type LucideIcon } from "lucide-react"
import { INBOX_ICON_CONFIG } from "@/features/inboxes/components/inbox-icon"
import type { ListInboxesResponse } from "@/features/inboxes/schema/action"
import type { MenuData, MenuItem, TranslationFn } from "../../types"
import { waFlowMenus } from "./wa-flow-menu"
import { waTemplateMenus } from "./wa-template-menus"

export const subMenus: Partial<
  Record<
    StepType,
    (
      t: TranslationFn,
      menuData?: MenuData,
      inbox?: ListInboxesResponse["data"][number],
    ) => MenuItem[]
  >
> = {
  [stepTypes.enum.sendWaTemplateMessage]: waTemplateMenus,
  [stepTypes.enum.whatsappFlow]: waFlowMenus,
}

export const integrationMenus = (
  t: TranslationFn,
  stepType: StepType,
  menuData?: MenuData,
  inboxChannel?: ChannelType,
): MenuItem[] => {
  let inboxes = menuData?.inboxes || []

  if (inboxChannel) {
    inboxes = inboxes.filter((inbox) => inbox.channel === inboxChannel)
  }

  const { Icon } = inboxChannel
    ? (INBOX_ICON_CONFIG[inboxChannel] ?? INBOX_ICON_CONFIG.omnichannel)
    : INBOX_ICON_CONFIG.omnichannel

  if (!inboxes || inboxes.length === 0) {
    return [
      {
        label: t("flows.actions.noTemplatesAvailable"),
        icon: GlobeIcon,
        stepType: null,
      },
    ]
  }

  return inboxes.map((inbox: ListInboxesResponse["data"][number]) => {
    let children: MenuItem[] | null = null

    if (subMenus[stepType]) {
      children = subMenus[stepType](t, menuData, inbox)
    }

    return {
      label: inbox.name,
      icon: Icon as LucideIcon,
      stepType: null,
      children: children ?? undefined,
    }
  })
}
