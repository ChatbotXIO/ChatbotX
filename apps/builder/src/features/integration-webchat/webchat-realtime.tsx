"use client"

import {
  realtimeEvents,
  realtimeEventTypes,
} from "@chatbotx.io/partysocket-config"
import usePartySocket from "partysocket/react"
import { env } from "@/env"
import type { MessageResource } from "../messages/schema/resource"
import { useGuestSessionStore } from "./providers/store/guest-session-provider"

type WebchatRealtimeProps = {
  guestConversationId: string
}

export function WebchatRealtime({ guestConversationId }: WebchatRealtimeProps) {
  const { handleNewMessage, setIsTyping } = useGuestSessionStore(
    (state) => state,
  )

  usePartySocket({
    host: env.NEXT_PUBLIC_PARTYSOCKET_URL,
    room: guestConversationId,
    party: "guests",

    // query: async () => {
    //   const oneTimeToken = await authClient.oneTimeToken.generate()

    //   return {
    //     token: oneTimeToken.data?.token,
    //   }
    // },

    // onOpen() {},
    onMessage(e) {
      try {
        const { eventType, data } = realtimeEvents.parse(JSON.parse(e.data))
        switch (eventType) {
          case realtimeEventTypes.enum.messageCreated:
            handleNewMessage(data as MessageResource)
            break
          case realtimeEventTypes.enum.typing:
            setIsTyping(data.typing)
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
