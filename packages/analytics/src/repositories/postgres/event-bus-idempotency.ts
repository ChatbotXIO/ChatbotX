import {
  EVENT_BUS_MESSAGE_ID,
  type EventBusMessageMetadata,
} from "@chatbotx.io/flow-config"

export function getEventBusEventId(
  row: EventBusMessageMetadata,
): string | undefined {
  const eventBusMessageId = row[EVENT_BUS_MESSAGE_ID]
  if (typeof eventBusMessageId === "string" && eventBusMessageId.length > 0) {
    return eventBusMessageId
  }

  return
}
