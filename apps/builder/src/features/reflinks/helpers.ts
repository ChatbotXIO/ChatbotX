"use client"

import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import { env } from "@/env"
import type { InboxResource } from "../inboxes/schemas/resource"

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
// WebChat: https://builder.example.com:3123/webchat?chatbotId=...&webchatId=...&ref=...
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
        `${env.NEXT_PUBLIC_BUILDER_URL}/webchat?chatbotId=${inbox.chatbotId}&webchatId=${inbox.sourceId}`,
        "ref",
        reflinkData,
      )
    default:
      return buildUrlWithParam(
        `${env.NEXT_PUBLIC_BUILDER_URL}/link?chatbotId=${inbox.chatbotId}`,
        "ref",
        reflinkData,
      )
  }
}
