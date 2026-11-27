import { logger } from "./logger"

const HEARTBEAT_INTERVAL_MS = 60_000
let heartbeatTimer: NodeJS.Timeout | undefined

export const startUptimeHeartbeat = (): void => {
  const url = process.env.UPTIME_KUMA_PUSH_URL
  if (!url || heartbeatTimer) {
    return
  }

  const sendHeartbeat = async (): Promise<void> => {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        logger.error(
          { status: response.status },
          "Uptime Kuma worker heartbeat was rejected",
        )
      }
    } catch (error) {
      logger.error({ err: error }, "Uptime Kuma worker heartbeat failed")
    }
  }

  const sendHeartbeatSafely = (): void => {
    sendHeartbeat().catch((error) => {
      logger.error({ err: error }, "Uptime Kuma worker heartbeat failed")
    })
  }

  sendHeartbeatSafely()
  heartbeatTimer = setInterval(sendHeartbeatSafely, HEARTBEAT_INTERVAL_MS)
  heartbeatTimer.unref()
}
