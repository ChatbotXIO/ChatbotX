import {
  type MessageEventListener,
  type MessageEventMap,
  type MessageEventType,
  messageEventSchemas,
  messageEventTypeSchema,
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
  messageEventTypeSchema.options.map((type) => [type, messageEventBus]),
) as Record<MessageEventType, typeof messageEventBus>
