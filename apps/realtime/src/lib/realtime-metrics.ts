import { logger } from "../logger"

export const REALTIME_METRIC_WINDOW_MS = 10_000

export type RealtimeServerCounters = {
  drops: number
  malformedRecords: number
  overloadCloses: number
  publishBytes: number
  publishes: number
  records: number
  sendBytes: number
  sends: number
  tokenRejections: number
  upgrades: number
}

export type RealtimeServerWindow = RealtimeServerCounters & {
  connections: number
  maxConnections: number
  shards: number
  windowStartedAt: number
}

export const createRealtimeServerCounters = (): RealtimeServerCounters => ({
  drops: 0,
  malformedRecords: 0,
  overloadCloses: 0,
  publishBytes: 0,
  publishes: 0,
  records: 0,
  sendBytes: 0,
  sends: 0,
  tokenRejections: 0,
  upgrades: 0,
})

export const recordRealtimeServerWindow = (
  window: RealtimeServerWindow,
): void => {
  logger.info(
    { metric: "realtime_server", ...window },
    "realtime_server_metric",
  )
}
