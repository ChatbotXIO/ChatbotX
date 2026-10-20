"use client"

import {
  createRealtimeFrameReader,
  RealtimeEventType,
  RealtimeFatalError,
  type RealtimeFrameReader,
  realtimeGuestBatchEnvelopeSchema,
} from "@chatbotx.io/realtime-protocol"
import { useCallback, useRef } from "react"
import type { MessageResource } from "../messages/schema/resource"
import { logRealtimeWarning } from "../realtime/realtime-warn-limiter"
import { useRealtimeSocket } from "../realtime/use-realtime-socket"
import { useTenantSettings } from "../tenant"
import { useGuestSessionStore } from "./providers/store/guest-session-provider"

type GuestRealtimeEnvelope = {
  data: unknown
  eventType: string
}

type WebchatRealtimeProps = {
  accessToken: string
  guestConversationId: string
  parentOrigin?: string | null
  webchatId: string
  workspaceId: string
}

export const reloadGuestSessionAfterFatalRealtimeError = ({
  error,
  hasOpened,
  reload,
}: {
  error: unknown
  hasOpened: boolean
  reload: () => void
}): boolean => {
  if (!(error instanceof RealtimeFatalError && hasOpened)) {
    return false
  }

  reload()
  return true
}

export function WebchatRealtime({
  accessToken,
  guestConversationId,
  parentOrigin,
  webchatId,
  workspaceId,
}: WebchatRealtimeProps) {
  const { publicRealtimeUrl } = useTenantSettings()
  const { handleNewMessage, setIsTyping } = useGuestSessionStore(
    (state) => state,
  )
  const frameReaderRef =
    useRef<RealtimeFrameReader<GuestRealtimeEnvelope> | null>(null)
  const hasOpenedOnceRef = useRef(false)

  const handleRealtimeEvent = useCallback(
    ({ data, eventType }: GuestRealtimeEnvelope): void => {
      switch (eventType) {
        case RealtimeEventType.messageCreated: {
          const message = data as MessageResource
          handleNewMessage(message)
          if (message.messageType === "outgoing") {
            setIsTyping(false)
          }
          return
        }
        case RealtimeEventType.typing:
          if (
            data &&
            typeof data === "object" &&
            "typing" in data &&
            typeof data.typing === "boolean"
          ) {
            setIsTyping(data.typing)
          }
          return
        default:
          return
      }
    },
    [handleNewMessage, setIsTyping],
  )

  if (!frameReaderRef.current) {
    frameReaderRef.current = createRealtimeFrameReader({
      onParseError: (error) => {
        logRealtimeWarning({
          error,
          message: "Webchat realtime: invalid batch frame",
          reason: "guest-invalid-batch",
          suppressionMessage:
            "Webchat realtime: further invalid-batch warnings suppressed for this window",
        })
      },
      onResyncNeeded: () => {
        frameReaderRef.current?.reset()
      },
      schema: realtimeGuestBatchEnvelopeSchema,
    })
  }

  const getSocketUrl = useCallback(async (): Promise<string> => {
    const response = await fetch("/api/guest/realtime-token", {
      body: JSON.stringify({
        guestConversationId,
        ...(parentOrigin ? { parentOrigin } : {}),
        webchatId,
        workspaceId,
      }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    })
    if (!response.ok) {
      const error = new Error(
        `Unable to mint guest realtime token: ${response.status}`,
      )
      if ([400, 403, 404].includes(response.status)) {
        throw new RealtimeFatalError(error.message)
      }
      throw error
    }

    const body: unknown = await response.json()
    if (
      !body ||
      typeof body !== "object" ||
      !("token" in body) ||
      typeof body.token !== "string"
    ) {
      throw new Error("Guest realtime token response is invalid")
    }

    const url = new URL(`rt/guests/${guestConversationId}`, publicRealtimeUrl)
    url.searchParams.set("token", body.token)
    const lastSeq = frameReaderRef.current?.getLastSeq()
    if (lastSeq) {
      url.searchParams.set("lastSeq", lastSeq)
    }
    return url.toString()
  }, [
    accessToken,
    guestConversationId,
    parentOrigin,
    publicRealtimeUrl,
    webchatId,
    workspaceId,
  ])

  useRealtimeSocket({
    connectionKey: `${publicRealtimeUrl}:${guestConversationId}`,
    getUrl: getSocketUrl,
    onError: (error) => {
      logRealtimeWarning({
        error,
        message: "Webchat realtime: socket connection failed",
        reason: "guest-socket-error",
        suppressionMessage:
          "Webchat realtime: further socket connection warnings suppressed for this window",
      })
      reloadGuestSessionAfterFatalRealtimeError({
        error,
        hasOpened: hasOpenedOnceRef.current,
        reload: () => window.location.reload(),
      })
    },
    onMessage: (data) => {
      const frames = frameReaderRef.current?.readFrame(data)
      if (!frames) {
        return
      }
      for (const frame of frames) {
        handleRealtimeEvent(frame)
      }
    },
    onOpen: () => {
      hasOpenedOnceRef.current = true
    },
    onResync: () => {
      frameReaderRef.current?.reset()
    },
  })

  return null
}
