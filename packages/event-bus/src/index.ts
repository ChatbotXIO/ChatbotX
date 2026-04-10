import { MessageEventBusByType } from "./message"
import type { BaseEventType, EventMap } from "./types"

export * from "./event-bus"
export * from "./message"
export * from "./types"

export const EventTypeMap = {
  ...MessageEventBusByType,
}

export async function emit<K extends keyof BaseEventType>(
  type: K,
  payload: EventMap[K],
) {
  const bus = EventTypeMap[type]
  if (bus) {
    await bus.emit(type, payload)
  }
}
