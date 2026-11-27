import { startWorker, stopWorker } from "@chatbotx.io/event-bus/worker"
import { isShutdownRequested, onShutdown, runWorker } from "../lib/shutdown"
import { analyticsDashboardEvents } from "./analytics"
import errorLogEventListener from "./error-log"
import flowEventListener from "./flow"
import messageEventListener from "./message"

async function startEventWorker() {
  await startWorker([
    messageEventListener,
    flowEventListener,
    analyticsDashboardEvents,
    errorLogEventListener,
  ])

  // A shutdown that began mid-startup ran `stopWorker` on a partial set.
  if (isShutdownRequested()) {
    await stopWorker()
  }
}

runWorker("events", startEventWorker)

onShutdown("events", stopWorker)
