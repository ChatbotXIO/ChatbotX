"use client"

import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import { env } from "@/env"
import type { InboxResource } from "../inboxes/schemas/resource"

// Messenger: https://m.me/FB_PAGE_ID?ref=giveaway
// Instagram: https://ig.me/m/INSTAGRAM_USERNAME?ref=giveaway
// WhatsApp: https://wa.me/PHONE_NUMBER?text=/giveaway
// Telegram: https://t.me/BOT_USERNAME?start=giveaway
// Viber: viber://pa?chatURI=BOT_USERNAME&context=giveaway
// WebChat: https://builder.example.com:3123/webchat?chatbotId=...&webchatId=...&ref=...
export const getInboxLink = (props: {
  inbox: InboxResource
  reflinkData?: string
}) => {
  const { inbox, reflinkData } = props

  switch (inbox.inboxType) {
    case "messenger": {
      const url = new URL(`https://m.me/${inbox.sourceId}`)
      if (reflinkData) {
        url.searchParams.set("ref", reflinkData)
      }
      return url.toString()
    }

    case "whatsapp": {
      const url = new URL(
        `https://wa.me/${(inbox.integrationWhatsapp?.auth as WhatsappAuthValue).metadata.phoneNumber.display_phone_number}`,
      )
      if (reflinkData) {
        url.searchParams.set("text", `/${reflinkData}`)
      }
      return url.toString()
    }

    case "webchat": {
      const url = new URL(
        `${env.NEXT_PUBLIC_BUILDER_URL}/webchat?chatbotId=${inbox.chatbotId}&webchatId=${inbox.sourceId}`,
      )
      if (reflinkData) {
        url.searchParams.set("ref", reflinkData)
      }
      return url.toString()
    }

    default: {
      const url = new URL(
        `${env.NEXT_PUBLIC_BUILDER_URL}/link?chatbotId=${inbox.chatbotId}`,
      )
      if (reflinkData) {
        url.searchParams.set("ref", reflinkData)
      }
      return url.toString()
    }
  }
}
