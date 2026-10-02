import {
  isRealtimeSeqAfter,
  RealtimeEventType,
  realtimeBatchEnvelopeSchema,
} from "@chatbotx.io/realtime-protocol"
import type { MessageResource } from "../../messages/schema/resource"

export type WebchatFrameHandler = {
  handleFrame: (data: string) => void
  reset: () => void
}

/**
 * Parses and dispatches one realtime wire frame for a guest webchat socket.
 * Guards against the two gaps a guest socket is exposed to that a workspace
 * socket already handles: heartbeat frames (guest sockets subscribe to the
 * shared `hb` topic) and duplicate deliveries (a guest socket's replay window
 * can overlap the live subscription, replaying a record twice).
 */
export const createWebchatFrameHandler = (handlers: {
  onMessage: (message: MessageResource) => void
  onParseError: (error: unknown) => void
  onTyping: (isTyping: boolean) => void
}): WebchatFrameHandler => {
  let lastSeq: string | null = null

  const handleFrame = (data: string): void => {
    try {
      const parsed: unknown = JSON.parse(data)
      if (parsed && typeof parsed === "object" && "hb" in parsed) {
        return
      }
      const batch = realtimeBatchEnvelopeSchema.safeParse(parsed)
      if (!batch.success) {
        return
      }
      const { seq } = batch.data
      if (lastSeq && !isRealtimeSeqAfter(seq, lastSeq)) {
        return
      }
      lastSeq = seq

      for (const event of batch.data.batch) {
        switch (event.eventType) {
          case RealtimeEventType.messageCreated: {
            const message = event.data as MessageResource
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
    } catch (error) {
      handlers.onParseError(error)
    }
  }

  const reset = (): void => {
    lastSeq = null
  }

  return { handleFrame, reset }
}
