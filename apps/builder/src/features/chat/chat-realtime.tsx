"use client"

import { useParams } from "next/navigation"
import { useChatStore } from "./store/chat-store-provider"
import usePartySocket from "partysocket/react"
import {
  RealtimeEventType,
  type RealtimeEventData,
} from "@aha.chat/party-config"
import type { MessageResource } from "../messages/schemas"

export function ChatRealtime() {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const { handleNewMessage } = useChatStore((state) => state)

  usePartySocket({
    host: process.env.NEXT_PUBLIC_PARTYSOCKET_URL,
    room: chatbotId,
    party: "chatbots",

    onOpen() {
      console.log("connected")
    },
    onMessage(e) {
      try {
        const { eventType, data } = JSON.parse(e.data) as RealtimeEventData
        switch (eventType) {
          case RealtimeEventType.CREATE_MESSAGE:
            handleNewMessage(data as MessageResource)
            break
          default:
            console.debug("Unhandled event: ", e.data)
        }
      } catch (e) {
        console.error("Unable to parse realtime message", e)
      }
    },
    onClose() {
      console.log("closed")
    },
    onError() {
      console.log("error")
    },
  })

  return <></>
}
