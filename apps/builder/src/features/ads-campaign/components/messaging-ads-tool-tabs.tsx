"use client"

import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { AppTab } from "@/components/app-tab"
import { useWorkspaceId } from "@/hooks/routing"
import {
  MESSAGING_ADS_TOOL_CHANNEL_LABEL_KEY,
  MESSAGING_ADS_TOOL_CHANNELS,
} from "../lib/tool-channels"
import { buildMessagingAdsToolPath } from "../lib/tool-path"

/**
 * Channel tabs for the Click to Message Ads tool — always renders all three
 * channels (WhatsApp, Messenger, Instagram), even ones with no integration
 * yet, since the tool doubles as the entry point for connecting a NEW
 * integration on that channel (plan decision #3). Switching tabs drops
 * `?integration=` — the previous channel's selection has no meaning on the
 * next one, so each tab's `href` omits it.
 */
export function MessagingAdsToolTabs() {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const pathname = usePathname()
  const activeSegment = pathname.split("/").at(-1)

  const tabs = MESSAGING_ADS_TOOL_CHANNELS.map((channel) => ({
    label: t(MESSAGING_ADS_TOOL_CHANNEL_LABEL_KEY[channel]),
    href: buildMessagingAdsToolPath({ workspaceId, channel }),
    isActive: activeSegment === channel,
  }))

  return <AppTab tabs={tabs} />
}
