import type { MessageEventMap } from "@chatbotx.io/event-bus"
import { MessageEventType } from "@chatbotx.io/event-bus"

export function transformPayload<K extends keyof MessageEventMap>(
  eventType: K,
  payload: MessageEventMap[K],
): MessageEventMap[K] {
  console.log("asdasd")
  if (eventType === MessageEventType.FAILED) {
    console.log({
      payload,
      eventType,
    })
  }

  return payload
}
