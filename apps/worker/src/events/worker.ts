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
    process.exit(1)
  }

  startWorker([
    messageEventListener,
    flowEventListener,
    analyticsDashboardEvents,
    errorLogEventListener,
  ])
}

runWorker("events", startEventWorker)

// uncaughtException / unhandledRejection are handled process-wide by
// lib/shutdown, for every worker sharing this process.
onShutdown("events", stopWorker)
