"use client"

import { useParams } from "next/navigation"
import { useChatStore } from "./store/chat-store-provider"
import usePartySocket from "partysocket/react"
import {
  RealtimeEventType,
  type RealtimeEventData,
} from "@aha.chat/partysocket-config"
import type { MessageResource } from "../messages/schemas"
import { env } from "@/env"
import { authClient } from "@/lib/auth-client"

export function ChatRealtime() {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const { handleNewMessage } = useChatStore((state) => state)

  usePartySocket({
    host: env.NEXT_PUBLIC_PARTYSOCKET_URL,
    room: chatbotId,
    party: "chatbots",

    query: async () => {
      const oneTimeToken = await authClient.oneTimeToken.generate()

      return {
        token: oneTimeToken.data?.token,
      }
    },

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
