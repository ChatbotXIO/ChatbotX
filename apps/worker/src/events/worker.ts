import { startWorker, stopWorker } from "@chatbotx.io/event-bus/worker"
import { ensureBootstrapped } from "../lib/bootstrap"
import { onShutdown, requestShutdown } from "../lib/shutdown"
import { analyticsDashboardEvents } from "./analytics"
import errorLogEventListener from "./error-log"
import flowEventListener from "./flow"
import messageEventListener from "./message"

async function startEventWorker() {
  try {
    await ensureBootstrapped()
    console.log("Event worker bootstrapped successfully")
  } catch (err) {
    console.error("Failed to bootstrap event worker", err)
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

onShutdown("events", stopWorker)

process.on("uncaughtException", (error) => {
  console.error("[EventWorker] Uncaught exception", error)
  requestShutdown("uncaughtException")
})

process.on("unhandledRejection", (reason) => {
  console.error("[EventWorker] Unhandled rejection", reason)
  requestShutdown("unhandledRejection")
})
