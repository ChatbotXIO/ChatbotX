import { logger } from "../logger"

export const REALTIME_METRIC_WINDOW_MS = 1000

export type RealtimeServerWindow = {
  bytesOut: number
  connections: number
  deliveries: number
  dropped: number
  events: number
  maxConnections: number
  requests: number
  windowStartedAt: number
  workspaceId: string
}

export const recordRealtimeServerWindow = (
  window: RealtimeServerWindow,
): void => {
  logger.info(
    { metric: "realtime_server", ...window },
    "realtime_server_metric",
  )
}
