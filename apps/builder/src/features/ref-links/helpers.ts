"use client"

import { InboxType } from "@aha.chat/database/types"
import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import { parsePhoneNumberFromString } from "libphonenumber-js"
import { env } from "@/env"
import type { InboxResource } from "../inboxes/schemas/resource"

// Messenger: https://m.me/FB_PAGE_ID?ref=giveaway
// Instagram: https://ig.me/m/INSTAGRAM_USERNAME?ref=giveaway
// WhatsApp: https://wa.me/PHONE_NUMBER?text=/giveaway
// Telegram: https://t.me/BOT_USERNAME?start=giveaway
// Viber: viber://pa?chatURI=BOT_USERNAME&context=giveaway
// WebChat: https://builder.example.com:3123/webchat?chatbotId=...&webchatId=...&ref=...
export const getInboxLink = ({
  inboxType,
  inboxes,
  refId,
  chatbotId,
}: {
  inboxType: InboxType
  inboxes: InboxResource[]
  refId?: string
  chatbotId: string
}) => {
  let link = ""
  switch (inboxType) {
    case InboxType.messenger: {
      const inbox = inboxes.find((i) => i.inboxType === InboxType.messenger)
      if (inbox) {
        link = `https://m.me/${inbox.sourceId}?${refId ? `ref=${refId}` : ""}`
      }
      break
    }

    case InboxType.whatsapp: {
      const inbox = inboxes.find((i) => i.inboxType === InboxType.whatsapp)
      if (inbox?.integrationWhatsapp) {
        const auth = inbox.integrationWhatsapp?.auth as
          | WhatsappAuthValue
          | undefined
        const phoneNumber =
          auth?.metadata.phoneNumber.display_phone_number ?? ""

        const formattedPhoneNumber =
          parsePhoneNumberFromString(
            phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`,
          )?.number.replace("+", "") ?? ""
        link = `https://wa.me/${formattedPhoneNumber}?${refId ? `text=/${refId}` : ""}`
      }
      break
    }

    case InboxType.webchat: {
      const inbox = inboxes.find((i) => i.inboxType === InboxType.webchat)
      if (inbox?.integrationWebchat) {
        link = `${env.NEXT_PUBLIC_BUILDER_URL}/webchat?chatbotId=${chatbotId}&webchatId=${inbox.integrationWebchat.id}&${refId ? `ref=${refId}` : ""}`
      }
      break
    }

    default: {
      link = `${env.NEXT_PUBLIC_BUILDER_URL}/link?chatbotId=${chatbotId}&ref=${refId}`
      break
    }
  }
  return link
}
