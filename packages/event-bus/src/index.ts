import {
  type AnalyticsDashboardEventMap,
  analyticsDashboardEventSchemas,
  type FlowEventMap,
  flowEventSchemas,
  type MessageEventMap,
  messageEventSchemas,
} from "@chatbotx.io/flow-config"
import { dashboardEventBus } from "./dashboard"
import { flowEventBus } from "./flow"
import { messageEventBus } from "./message"

export type {
  BaseEventListener,
  InferEventMap,
} from "@chatbotx.io/flow-config"
export * from "./dashboard"
export * from "./event-bus"
export * from "./flow"
export * from "./message"

export type EventMap = MessageEventMap &
  FlowEventMap &
  AnalyticsDashboardEventMap

export function emit<K extends keyof EventMap>(type: K, payload: EventMap[K]) {
  if (type in messageEventSchemas) {
    return messageEventBus.emit(
      type as keyof MessageEventMap,
      payload as MessageEventMap[keyof MessageEventMap],
    )
  }
  if (type in flowEventSchemas) {
    return flowEventBus.emit(
      type as keyof FlowEventMap,
      payload as FlowEventMap[keyof FlowEventMap],
    )
  }
  if (type in analyticsDashboardEventSchemas) {
    return dashboardEventBus.emit(
      type as keyof AnalyticsDashboardEventMap,
      payload as AnalyticsDashboardEventMap[keyof AnalyticsDashboardEventMap],
    )
  }
  return Promise.resolve("")
}
