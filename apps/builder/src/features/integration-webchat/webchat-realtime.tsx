"use client"

import { RealtimeSocket } from "@chatbotx.io/realtime-protocol"
import { useEffect } from "react"
import { useShallow } from "zustand/react/shallow"
import { getClientEmbeddingOrigin } from "@/features/integration-webchat/lib/authorized-domain"
import { logger } from "@/lib/log"
import { useTenantSettings } from "../tenant"
import { createWebchatFrameHandler } from "./lib/webchat-realtime-frames"
import { useGuestSessionStore } from "./providers/store/guest-session-provider"

type WebchatRealtimeProps = {
  guestConversationId: string
}

// Matches webchat-message-list.tsx's page size: a reconnect refetch only
// needs to cover at least as many messages as fit in the visible list.
const RECONNECT_REFETCH_PAGE_SIZE = 50

export function WebchatRealtime({ guestConversationId }: WebchatRealtimeProps) {
  const { publicRealtimeUrl } = useTenantSettings()
  const {
    accessToken,
    config,
    handleNewMessage,
    refetchLatestMessages,
    setIsTyping,
  } = useGuestSessionStore(
    useShallow((state) => ({
      accessToken: state.accessToken,
      config: state.config,
      handleNewMessage: state.handleNewMessage,
      refetchLatestMessages: state.refetchLatestMessages,
      setIsTyping: state.setIsTyping,
    })),
  )

  useEffect(() => {
    if (!accessToken) {
      return
    }
    let hasConnectedOnce = false
    const frameHandler = createWebchatFrameHandler({
      onMessage: handleNewMessage,
      onParseError: (error) => {
        logger.warn({ err: error }, "Unable to parse realtime message")
      },
      onTyping: setIsTyping,
    })
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
      onClose: ({ code, reason }) => {
        logger.warn({ code, reason }, "Webchat realtime connection closed")
      },
      onError: (error) => {
        logger.warn({ err: error }, "Webchat realtime connection failed")
      },
      onMessage: frameHandler.handleFrame,
      onOpen: () => {
        frameHandler.reset()
        // A guest socket carries no stream cursor (unlike the workspace
        // socket), so a reconnect — not the very first open — can't tell on
        // its own whether anything arrived during the gap. Refetch the
        // latest page and merge in whatever the live subscription missed.
        if (hasConnectedOnce) {
          refetchLatestMessages(RECONNECT_REFETCH_PAGE_SIZE).catch((error) => {
            logger.warn(
              { err: error },
              "Failed to refetch webchat messages after reconnect",
            )
          })
        }
        hasConnectedOnce = true
      },
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
    refetchLatestMessages,
    setIsTyping,
  ])

  return null
}
