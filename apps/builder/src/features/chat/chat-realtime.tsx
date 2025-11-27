"use client"

import {
  type RealtimeEventData,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import { useParams } from "next/navigation"
import usePartySocket from "partysocket/react"
import { env } from "@/env"
import { authClient } from "@/lib/auth/auth-client"
import type { MessageResource } from "../messages/schemas"
import { useChatStore } from "./store/chat-store-provider"

export function ChatRealtime() {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const { handleNewMessage } = useChatStore((state) => state)

  usePartySocket({
    host: env.NEXT_PUBLIC_PARTYSOCKET_URL,
    room: chatbotId,
    party: "chatbots",
    // protocol: "ws",

    query: async () => {
      const oneTimeToken = await authClient.oneTimeToken.generate()

      return {
        token: oneTimeToken.data?.token,
      }
    },

    // onOpen() {},
    onMessage(e) {
      try {
        const { eventType, data } = JSON.parse(e.data) as RealtimeEventData
        switch (eventType) {
          case RealtimeEventType.CREATE_MESSAGE:
            handleNewMessage(data as MessageResource)
            break
          default:
            break
        }
      } catch (error) {
        console.error("Unable to parse realtime message", error)
      }
    },
    // onClose() {},
    // onError() {},
  })

  return <div />
}
