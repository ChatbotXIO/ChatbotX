import { type ChannelType, channelTypes } from "@chatbotx.io/database/partials"
import { GlobeIcon, type LucideIcon } from "lucide-react"
import { INBOX_ICON_CONFIG } from "@/features/inboxes/components/inbox-icon"
import type { MenuData, MenuItem, TranslationFn } from "../../types"
import { waTemplateMenus } from "./wa-template-menus"

export const integrationMenus = (
  t: TranslationFn,
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

  return inboxes.map((inbox) => {
    let children: MenuItem[] | null = null

    if (inboxChannel === channelTypes.enum.whatsapp) {
      children = waTemplateMenus(t, menuData, inbox)
    }

    return {
      label: inbox.name,
      icon: Icon as LucideIcon,
      stepType: null,
      children: children ?? undefined,
    }
  })
}
