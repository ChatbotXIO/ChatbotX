"use client"

import {
  RealtimeFatalError,
  RealtimeSocket,
} from "@chatbotx.io/realtime-protocol"
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

// Past this many consecutive non-fatal close/retry cycles, or this long
// without a single successful open, the widget stops silently retrying in
// the UI's eyes and tells the guest the connection is down — otherwise a
// sustained outage (not a 401/403, which is already fatal) leaves the
// widget showing "connecting" forever with no signal anything is wrong.
// See PR #1349 finding #9.
const MAX_CONSECUTIVE_CONNECT_FAILURES = 5
const MAX_CONNECTING_DURATION_MS = 30_000

export function WebchatRealtime({ guestConversationId }: WebchatRealtimeProps) {
  const { publicRealtimeUrl } = useTenantSettings()
  const {
    accessToken,
    config,
    handleNewMessage,
    refetchLatestMessages,
    setConnectionStatus,
    setIsTyping,
  } = useGuestSessionStore(
    useShallow((state) => ({
      accessToken: state.accessToken,
      config: state.config,
      handleNewMessage: state.handleNewMessage,
      refetchLatestMessages: state.refetchLatestMessages,
      setConnectionStatus: state.setConnectionStatus,
      setIsTyping: state.setIsTyping,
    })),
  )

  useEffect(() => {
    if (!accessToken) {
      return
    }
    let hasConnectedOnce = false
    let consecutiveFailureCount = 0
    let firstFailureAtMs: number | null = null
    const recordConnectFailure = (): boolean => {
      consecutiveFailureCount += 1
      firstFailureAtMs ??= Date.now()
      if (
        consecutiveFailureCount >= MAX_CONSECUTIVE_CONNECT_FAILURES ||
        Date.now() - firstFailureAtMs >= MAX_CONNECTING_DURATION_MS
      ) {
        setConnectionStatus("closed")
        return true
      }
      return false
    }
    setConnectionStatus("connecting")
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
        if (response.status === 401 || response.status === 403) {
          // The access token itself is unauthorized — re-minting the
          // realtime token on the same token would fail the same way
          // forever, so give up instead of backing off indefinitely.
          throw new RealtimeFatalError(
            "Webchat realtime token mint was unauthorized",
          )
        }
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
        if (!recordConnectFailure()) {
          setConnectionStatus("connecting")
        }
      },
      onError: (error) => {
        logger.warn({ err: error }, "Webchat realtime connection failed")
        if (error instanceof RealtimeFatalError) {
          setConnectionStatus("closed")
        } else {
          recordConnectFailure()
        }
      },
      onMessage: frameHandler.handleFrame,
      onOpen: () => {
        consecutiveFailureCount = 0
        firstFailureAtMs = null
        frameHandler.reset()
        setConnectionStatus("open")
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
    setConnectionStatus,
    setIsTyping,
  ])

  return null
}
