import { flushAllPendingWorkspaceRealtimeEvents } from "@chatbotx.io/business"
import { startWorker, stopWorker } from "@chatbotx.io/event-bus/worker"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"
import { onShutdown, runWorker } from "../lib/shutdown"
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
    throw err
  }

  startWorker([
    messageEventListener,
    flowEventListener,
    analyticsDashboardEvents,
    errorLogEventListener,
  ])
}

runWorker("events", startEventWorker)

onShutdown("events", async () => {
  try {
    await stopWorker()
  } finally {
    await flushAllPendingWorkspaceRealtimeEvents()
  }
})
