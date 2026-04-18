"use client"

import { env } from "@/env"
import type { ListInboxesResponse } from "../inboxes/schema/action"

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
  inbox: ListInboxesResponse["data"][number]
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
    case "instagram":
      return buildUrlWithParam(
        `https://ig.me/m/${inbox.integrationInstagram?.username ?? ""}`,
        "ref",
        reflinkData,
      )
    case "whatsapp": {
      const phoneNumber = inbox.integrationWhatsapp?.name ?? ""
      return buildUrlWithParam(
        `https://wa.me/${phoneNumber}`,
        "text",
        reflinkData ? `/${reflinkData}` : undefined,
      )
    }
    case "telegram":
      return buildUrlWithParam(
        `https://t.me/${inbox.name.slice(1) ?? inbox.sourceId}`,
        "start",
        reflinkData,
      )
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
