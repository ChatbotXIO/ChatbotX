import { logger } from "../logger"

const REALTIME_METRIC_WINDOW_MS = 10_000

type RealtimeRelayWindow = {
  backpressureLogged: boolean
  bytes: number
  errors: number
  eventTypes: Record<string, number>
  events: number
  flushes: number
  maxBatchEvents: number
  windowStartedAt: number
}

const createEmptyRelayWindow = (): RealtimeRelayWindow => ({
  backpressureLogged: false,
  bytes: 0,
  errors: 0,
  eventTypes: {},
  events: 0,
  flushes: 0,
  maxBatchEvents: 0,
  windowStartedAt: Date.now(),
})

let relayWindow = createEmptyRelayWindow()

export const recordRealtimeRelayEvent = (
  eventType: string,
  byteLength: number,
): void => {
  relayWindow.events += 1
  relayWindow.bytes += byteLength
  relayWindow.eventTypes[eventType] =
    (relayWindow.eventTypes[eventType] ?? 0) + 1
}

export const recordRealtimeRelayFlush = (eventCount: number): void => {
  relayWindow.flushes += 1
  relayWindow.maxBatchEvents = Math.max(relayWindow.maxBatchEvents, eventCount)
}

export const recordRealtimeRelayError = (): void => {
  relayWindow.errors += 1
}

export const recordRealtimeRelayBackpressure = (): boolean => {
  relayWindow.errors += 1
  if (relayWindow.backpressureLogged) {
    return false
  }
  relayWindow.backpressureLogged = true
  return true
}

export const flushRealtimeRelayMetrics = (force: boolean): void => {
  const isEmpty =
    relayWindow.events === 0 &&
    relayWindow.flushes === 0 &&
    relayWindow.errors === 0
  if (
    isEmpty ||
    (!force &&
      Date.now() - relayWindow.windowStartedAt < REALTIME_METRIC_WINDOW_MS)
  ) {
    return
  }
  logger.info(
    { metric: "realtime_relay", ...relayWindow },
    "realtime_relay_metric",
  )
  relayWindow = createEmptyRelayWindow()
}

export const resetRealtimeRelayMetricsForTests = (): void => {
  relayWindow = createEmptyRelayWindow()
}
