import {
  type MessageEventListener,
  type MessageEventMap,
  MessageEventType,
  messageEventSchemas,
} from "@chatbotx.io/flow-config"
import { getRedisConnection } from "@chatbotx.io/worker-config"
import { BaseEventBus } from "../event-bus"

const MAX_MESSAGE_EVENTS = 100_000

export const messageEventBus = new BaseEventBus<
  MessageEventMap,
  MessageEventListener
>(getRedisConnection(), {
  streamKey: "events:message",
  consumerGroup: "message-events-group",
  maxLen: MAX_MESSAGE_EVENTS,
  schemas: messageEventSchemas,
})

export const MessageEventBusByType = Object.fromEntries(
  Object.values(MessageEventType).map((type) => [type, messageEventBus]),
) as Record<MessageEventType, typeof messageEventBus>
