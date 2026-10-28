import { startWorker, stopWorker } from "@chatbotx.io/event-bus/worker"
import { onShutdown, runWorker } from "../lib/shutdown"
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
}

runWorker("events", startEventWorker)

onShutdown("events", stopWorker)
