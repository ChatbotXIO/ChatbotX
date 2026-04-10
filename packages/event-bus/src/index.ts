import {
  type FlowEventMap,
  flowEventSchemas,
  type MessageEventMap,
  messageEventSchemas,
} from "@chatbotx.io/flow-config"
import { flowEventBus } from "./flow"
import { messageEventBus } from "./message"

export type {
  BaseEventListener,
  InferEventMap,
} from "@chatbotx.io/flow-config"
export * from "./event-bus"
export * from "./flow"
export * from "./message"

export type EventMap = MessageEventMap & FlowEventMap

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
  return Promise.resolve("")
}
