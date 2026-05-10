"use client"

import { env } from "@/env"
import type { ListInboxesResponse } from "./schema/action"

const getPublicOrigin = () => {
  if (typeof window !== "undefined") {
    return window.location.origin
  }
  return env.NEXT_PUBLIC_BUILDER_URL
}

// Viber: viber://pa?chatURI=BOT_USERNAME&context=giveaway
export const getInboxLink = (props: {
  inbox: ListInboxesResponse["data"][number]
  ref?: string
}): string => {
  const { inbox, ref } = props

  // Messenger: https://m.me/FB_PAGE_ID?ref=giveaway
  if (inbox.channel === "messenger") {
    const url = new URL("", `https://m.me/${inbox.sourceId}`)
    if (ref) {
      url.searchParams.set("ref", ref)
    }
    return url.toString()
  }

  // Instagram: https://ig.me/m/INSTAGRAM_USERNAME?ref=giveaway
  if (inbox.channel === "instagram") {
    const url = new URL(
      "",
      `https://ig.me/m/${inbox.integrationInstagram?.username ?? ""}`,
    )
    if (ref) {
      url.searchParams.set("ref", ref)
    }
    return url.toString()
  }

  // WhatsApp: https://wa.me/PHONE_NUMBER?text=/giveaway
  if (inbox.channel === "whatsapp") {
    const displayPhoneNumber =
      inbox.integrationWhatsapp?.displayPhoneNumber ?? "-"

    const url = new URL("", `https://wa.me/${displayPhoneNumber}`)
    if (ref) {
      url.searchParams.set("text", `/${ref}`)
    }
    return url.toString()
  }

  // Telegram: https://t.me/BOT_USERNAME?start=giveaway
  if (inbox.channel === "telegram") {
    const url = new URL("", `https://t.me/${inbox.name}`)
    if (ref) {
      url.searchParams.set("start", ref)
    }
    return url.toString()
  }

  // WebChat: https://builder.example.com:3123/webchat?workspaceId=...&webchatId=...&ref=...
  if (inbox.channel === "webchat") {
    const url = new URL(
      `/webchat?workspaceId=${inbox.workspaceId}&webchatId=${inbox.sourceId}`,
      getPublicOrigin(),
    )
    if (ref) {
      url.searchParams.set("ref", ref)
    }
    return url.toString()
  }

  if (inbox.channel === "zalo") {
    const url = new URL("", `https://zalo.me/${inbox.sourceId ?? ""}`)
    if (ref) {
      url.searchParams.set("ref", ref)
    }
    return url.toString()
  }

  const url = new URL(
    `/link?workspaceId=${inbox.workspaceId}`,
    getPublicOrigin(),
  )
  if (ref) {
    url.searchParams.set("ref", ref)
  }

  return url.toString()
}
