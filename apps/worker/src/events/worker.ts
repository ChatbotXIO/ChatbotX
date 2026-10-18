import { flushAllPendingWorkspaceRealtimeEvents } from "@chatbotx.io/business"
import { startWorker, stopWorker } from "@chatbotx.io/event-bus/worker"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"
import { analyticsDashboardEvents } from "./analytics"
import errorLogEventListener from "./error-log"
import flowEventListener from "./flow"
import messageEventListener from "./message"

async function startEventWorker() {
  try {
    await ensureBootstrapped()
    logger.info("Event worker bootstrapped successfully")
  } catch (err) {
    logger.error({ err }, "Failed to bootstrap event worker")
    process.exit(1)
  }

  startWorker([
    messageEventListener,
    flowEventListener,
    analyticsDashboardEvents,
    errorLogEventListener,
  ])
}

startEventWorker()

let isShuttingDown = false
async function shutdown(signal: "SIGINT" | "SIGTERM") {
  if (isShuttingDown) {
    logger.info({ signal }, "Event worker is already shutting down")
    return
  }

  isShuttingDown = true

  let shutdownFailed = false
  try {
    await stopWorker()
  } catch (err) {
    shutdownFailed = true
    logger.error({ err }, "Event worker error stopping during shutdown")
  } finally {
    try {
      await flushAllPendingWorkspaceRealtimeEvents()
    } catch (err) {
      shutdownFailed = true
      logger.error({ err }, "Event worker error flushing realtime events")
    }
  }
  process.exit(shutdownFailed ? 1 : 0)
}

process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Event worker uncaught exception")
  shutdown("SIGTERM").catch((shutdownError) => {
    logger.error({ err: shutdownError }, "Event worker shutdown failed")
  })
})

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Event worker unhandled rejection")
  shutdown("SIGTERM").catch((shutdownError) => {
    logger.error({ err: shutdownError }, "Event worker shutdown failed")
  })
})
