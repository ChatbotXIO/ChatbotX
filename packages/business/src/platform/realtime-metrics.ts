import { logger } from "../logger"

export const REALTIME_METRIC_WINDOW_MS = 10_000

export type RealtimeRelayWindow = {
  bytes: number
  errors: number
  eventTypes: Record<string, number>
  events: number
  flushes: number
  maxBatchEvents: number
  windowStartedAt: number
}

export const recordRealtimeRelayWindow = (
  window: RealtimeRelayWindow,
): void => {
  logger.info({ metric: "realtime_relay", ...window }, "realtime_relay_metric")
}
