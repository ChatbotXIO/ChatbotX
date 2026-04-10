import { getRedisConnection } from "@chatbotx.io/worker-config"
import { BaseEventBus } from "../event-bus"
import { messageEventSchemas } from "./schemas"
import {
  type MessageEventListener,
  type MessageEventMap,
  MessageEventType,
} from "./types"

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

export const MessageEventBusByType = {
  ...Object.fromEntries(
    Object.values(MessageEventType).map((type) => [type, messageEventBus]),
  ),
}
