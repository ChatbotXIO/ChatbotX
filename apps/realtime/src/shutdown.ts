import type { RealtimeGateway } from "./gateway"
import { logger } from "./logger"

export const createShutdownHandler = (
  gateway: Pick<RealtimeGateway, "close">,
): ((signal: NodeJS.Signals) => Promise<void>) => {
  let shuttingDown = false

  return async (signal) => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    logger.info({ signal }, "Stopping realtime gateway")
    try {
      await gateway.close()
    } catch (error) {
      logger.error(
        { err: error, signal },
        "Error while stopping realtime gateway",
      )
    }
  }
}
