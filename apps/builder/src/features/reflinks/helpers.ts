"use client"

import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { env } from "@/env"
import type { InboxResource } from "../inboxes/schema/resource"

const buildUrlWithParam = (
  baseUrl: string,
  paramKey: string,
  paramValue?: string,
): string => {
  const url = new URL(baseUrl)
  if (paramValue) {
    url.searchParams.set(paramKey, paramValue)
  }
  return url.toString()
}

// Messenger: https://m.me/FB_PAGE_ID?ref=giveaway
// Instagram: https://ig.me/m/INSTAGRAM_USERNAME?ref=giveaway
// WhatsApp: https://wa.me/PHONE_NUMBER?text=/giveaway
// Telegram: https://t.me/BOT_USERNAME?start=giveaway
// Viber: viber://pa?chatURI=BOT_USERNAME&context=giveaway
// WebChat: https://builder.example.com:3123/webchat?workspaceId=...&webchatId=...&ref=...
export const getInboxLink = (props: {
  inbox: InboxResource
  reflinkData?: string
}): string => {
  const { inbox, reflinkData } = props

  switch (inbox.channel) {
    case "messenger":
      return buildUrlWithParam(
        `https://m.me/${inbox.sourceId}`,
        "ref",
        reflinkData,
      )
    case "whatsapp": {
      const phoneNumber = (
        inbox.integrationWhatsapp?.auth as WhatsappAuthValue | undefined
      )?.metadata?.phoneNumber?.display_phone_number
      return buildUrlWithParam(
        `https://wa.me/${phoneNumber ?? ""}`,
        "text",
        reflinkData ? `/${reflinkData}` : undefined,
      )
    }
    case "webchat":
      return buildUrlWithParam(
        `${env.NEXT_PUBLIC_BUILDER_URL}/webchat?workspaceId=${inbox.workspaceId}&webchatId=${inbox.sourceId}`,
        "ref",
        reflinkData,
      )
    default:
      return buildUrlWithParam(
        `${env.NEXT_PUBLIC_BUILDER_URL}/link?workspaceId=${inbox.workspaceId}`,
        "ref",
        reflinkData,
      )
  }
}
