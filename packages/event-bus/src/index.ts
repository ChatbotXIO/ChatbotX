import { FlowEventBusByType } from "./flow/event-bus"
import { MessageEventBusByType } from "./message"
import type { BaseEventType, EventMap } from "./types"

export * from "./event-bus"
export * from "./flow"
export * from "./message"
export * from "./types"

export const EventTypeMap = {
  ...MessageEventBusByType,
  ...FlowEventBusByType,
}

export async function emit<K extends keyof BaseEventType>(
  type: K,
  payload: EventMap[K],
) {
  const bus = EventTypeMap[type]
  if (bus) {
    // console.log("Emitting event:", type, payload)
    await bus.emit(type, payload)
  }
}
