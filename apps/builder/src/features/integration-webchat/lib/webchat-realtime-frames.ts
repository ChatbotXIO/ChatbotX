import {
  createRealtimeFrameReader,
  RealtimeEventType,
  realtimeGuestBatchEnvelopeSchema,
} from "@chatbotx.io/realtime-protocol"
import {
  type MessageResource,
  messageResource,
} from "../../messages/schema/resource"

export type WebchatFrameHandler = {
  handleFrame: (data: string) => void
  reset: () => void
}

/**
 * Parses and dispatches one realtime wire frame for a guest webchat socket.
 * Guards against the two gaps a guest socket is exposed to that a workspace
 * socket already handles: heartbeat frames (guest sockets subscribe to the
 * shared `hb` topic) and duplicate deliveries (a guest socket's replay window
 * can overlap the live subscription, replaying a record twice) — both
 * handled by the shared `createRealtimeFrameReader`.
 */
export const createWebchatFrameHandler = (handlers: {
  onMessage: (message: MessageResource) => void
  onParseError: (error: unknown) => void
  onResyncNeeded: () => void
  onTyping: (isTyping: boolean) => void
}): WebchatFrameHandler => {
  const frameReader = createRealtimeFrameReader({
    onParseError: handlers.onParseError,
    onResyncNeeded: handlers.onResyncNeeded,
    schema: realtimeGuestBatchEnvelopeSchema,
  })

  const handleFrame = (data: string): void => {
    const batch = frameReader.readFrame(data)
    if (!batch) {
      return
    }

    for (const event of batch) {
      switch (event.eventType) {
        case RealtimeEventType.messageCreated: {
          const parsedMessage = messageResource.safeParse(event.data)
          if (!parsedMessage.success) {
            handlers.onParseError(parsedMessage.error)
            frameReader.reportInvalidEvent()
            break
          }
          const message = parsedMessage.data
          handlers.onMessage(message)
          if (message.messageType === "outgoing") {
            handlers.onTyping(false)
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
            handlers.onTyping(event.data.typing)
          }
          break
        default:
          break
      }
    }
  }

  return { handleFrame, reset: frameReader.reset }
}
