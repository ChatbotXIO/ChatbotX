import type { MessageEventMap } from "@chatbotx.io/event-bus"
import { MessageEventType } from "@chatbotx.io/flow-config"

export function transformPayload<K extends keyof MessageEventMap>(
  eventType: K,
  payload: MessageEventMap[K],
): MessageEventMap[K] {
  if (eventType === MessageEventType["message:failed"]) {
    console.log({
      payload,
      eventType,
    })
  }

  return payload
}
