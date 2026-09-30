import type { ListInboxesResponse } from "@chatbotx.io/business"
import type { ChannelType } from "@chatbotx.io/database/partials"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  GlobeIcon,
  LoaderIcon,
  type LucideIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { INBOX_ICON_CONFIG } from "@/features/inboxes/components/inbox-icon"
import type { MenuData, MenuItem, TranslationFn } from "../../types"
import { messengerTemplateMenus } from "./messenger-template-menus"
import { waFlowMenus } from "./wa-flow-menu"
import { waTemplateMenus } from "./wa-template-menus"

// Channels that support template messages. Omnichannel shows all of them.
const TEMPLATE_CHANNELS: ChannelType[] = [
  channelTypes.enum.whatsapp,
  channelTypes.enum.messenger,
]

const inboxStatusMenu = (
  t: TranslationFn,
  status: MenuData["inboxesStatus"] | undefined,
): MenuItem[] | null => {
  if (status === "pending") {
    return [{ label: t("actions.loading"), icon: LoaderIcon, stepType: null }]
  }

  if (status === "error") {
    return [
      {
        label: t("flows.actions.inboxesUnavailable"),
        icon: TriangleAlertIcon,
        stepType: null,
      },
    ]
  }

  return null
}

export const integrationMenus = (
  t: TranslationFn,
  menuData?: MenuData,
  inboxChannel?: ChannelType,
): MenuItem[] => {
  const statusMenu = inboxStatusMenu(t, menuData?.inboxesStatus)
  if (statusMenu) {
    return statusMenu
  }

  // A concrete channel filters to that channel; omnichannel (or no channel)
  // shows every template-supporting inbox so both WhatsApp and Messenger appear.
  const isSpecificChannel =
    inboxChannel != null && inboxChannel !== channelTypes.enum.omnichannel

  const inboxes = (menuData?.inboxes ?? []).filter((inbox) => {
    const channel = inbox.channel as ChannelType
    return isSpecificChannel
      ? channel === inboxChannel
      : TEMPLATE_CHANNELS.includes(channel)
  })

  if (inboxes.length === 0) {
    return [
      {
        label: t("flows.actions.noTemplatesAvailable"),
        icon: GlobeIcon,
        stepType: null,
      },
    ]
  }

  // Resolve children + icon per inbox.channel so a single (omnichannel) call can
  // mix WhatsApp and Messenger inboxes in one list.
  return inboxes.map((inbox) => {
    const channel = inbox.channel as ChannelType
    let children: MenuItem[] | null = null

    if (channel === channelTypes.enum.whatsapp) {
      children = waTemplateMenus(t, menuData, inbox)
    } else if (channel === channelTypes.enum.messenger) {
      children = messengerTemplateMenus(t, menuData, inbox)
    }

    const { Icon } = INBOX_ICON_CONFIG[channel] ?? INBOX_ICON_CONFIG.omnichannel

    return {
      label: inbox.name,
      icon: Icon as LucideIcon,
      stepType: null,
      children: children ?? undefined,
    }
  })
}

export const waFlowIntegrationMenus = (
  t: TranslationFn,
  menuData?: MenuData,
): MenuItem[] => {
  const statusMenu = inboxStatusMenu(t, menuData?.inboxesStatus)
  if (statusMenu) {
    return statusMenu
  }

  const inboxes = (menuData?.inboxes ?? []).filter(
    (inbox) => inbox.channel === channelTypes.enum.whatsapp,
  )

  if (inboxes.length === 0) {
    return [
      {
        label: t("flows.actions.noTemplatesAvailable"),
        icon: GlobeIcon,
        stepType: null,
      },
    ]
  }

  const { Icon } = INBOX_ICON_CONFIG[channelTypes.enum.whatsapp]

  return inboxes.map((inbox: ListInboxesResponse["data"][number]) => ({
    label: inbox.name,
    icon: Icon as LucideIcon,
    stepType: null,
    children: waFlowMenus(t, menuData, inbox),
  }))
}
