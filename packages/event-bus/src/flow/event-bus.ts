import { getRedisConnection } from "@chatbotx.io/worker-config"
import { BaseEventBus } from "../event-bus"
import { flowEventSchemas } from "./schemas"
import {
  type FlowEventListener,
  type FlowEventMap,
  FlowEventType,
} from "./types"

const MAX_MESSAGE_EVENTS = 100_000

export const flowEventBus = new BaseEventBus<FlowEventMap, FlowEventListener>(
  getRedisConnection(),
  {
    streamKey: "flow:events",
    consumerGroup: "flow-events-group",
    maxLen: MAX_MESSAGE_EVENTS,
    schemas: flowEventSchemas,
  },
)

export const FlowEventBusByType = {
  ...Object.fromEntries(
    Object.values(FlowEventType).map((type) => [type, flowEventBus]),
  ),
}
