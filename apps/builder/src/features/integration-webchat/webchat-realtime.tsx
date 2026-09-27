"use client"

import {
  RealtimeEventType,
  RealtimeSocket,
  realtimeBatchEnvelopeSchema,
} from "@chatbotx.io/realtime-protocol"
import { useEffect } from "react"
import { useShallow } from "zustand/react/shallow"
import { getClientEmbeddingOrigin } from "@/features/integration-webchat/lib/authorized-domain"
import { logger } from "@/lib/log"
import type { MessageResource } from "../messages/schema/resource"
import { useTenantSettings } from "../tenant"
import { useGuestSessionStore } from "./providers/store/guest-session-provider"

type WebchatRealtimeProps = {
  guestConversationId: string
}

export function WebchatRealtime({ guestConversationId }: WebchatRealtimeProps) {
  const { publicRealtimeUrl } = useTenantSettings()
  const { accessToken, config, handleNewMessage, setIsTyping } =
    useGuestSessionStore(
      useShallow((state) => ({
        accessToken: state.accessToken,
        config: state.config,
        handleNewMessage: state.handleNewMessage,
        setIsTyping: state.setIsTyping,
      })),
    )

  useEffect(() => {
    if (!accessToken) {
      return
    }
    const handleMessage = (data: string): void => {
      try {
        const batch = realtimeBatchEnvelopeSchema.safeParse(JSON.parse(data))
        if (!batch.success) {
          return
        }
        const events = batch.data.batch
        for (const event of events) {
          switch (event.eventType) {
            case RealtimeEventType.messageCreated: {
              const message = event.data as MessageResource
              handleNewMessage(message)
              if (message.messageType === "outgoing") {
                setIsTyping(false)
              }
              break
            }
            case RealtimeEventType.typing:
              if (
                event.data &&
                typeof event.data === "object" &&
                "typing" in event.data &&
                typeof event.data.typing === "boolean"
              ) {
                setIsTyping(event.data.typing)
              }
              break
            default:
              break
          }
        }
      } catch (error) {
        logger.warn({ err: error }, "Unable to parse realtime message")
      }
    }
    const socket = new RealtimeSocket({
      getUrl: async () => {
        if (!accessToken) {
          throw new Error("Webchat access token is required for realtime")
        }
        const response = await fetch("/api/guest/realtime-token", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            guestConversationId,
            parentOrigin: getClientEmbeddingOrigin() ?? undefined,
            webchatId: config.id,
            workspaceId: config.workspaceId,
          }),
        })
        if (!response.ok) {
          throw new Error("Unable to mint webchat realtime token")
        }
        const { token } = (await response.json()) as { token: string }
        const socketUrl = new URL(
          `/rt/guests/${encodeURIComponent(guestConversationId)}`,
          publicRealtimeUrl,
        )
        socketUrl.searchParams.set("token", token)
        return socketUrl.toString()
      },
      onMessage: handleMessage,
    })
    socket.connect()

    return () => socket.close()
  }, [
    accessToken,
    config.id,
    config.workspaceId,
    guestConversationId,
    handleNewMessage,
    publicRealtimeUrl,
    setIsTyping,
  ])

  return null
}
