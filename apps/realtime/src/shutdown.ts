import type { RealtimeGateway } from "./gateway"
import { logger } from "./logger"

const SHUTDOWN_FORCE_EXIT_MS = 10_000

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
    setTimeout(() => {
      process.exit(process.exitCode ?? 0)
    }, SHUTDOWN_FORCE_EXIT_MS).unref()
    try {
      await gateway.close()
    } catch (error) {
      process.exitCode = 1
      logger.error(
        { err: error, signal },
        "Error while stopping realtime gateway",
      )
    }
  }
}
