import { startWorker, stopWorker } from "@chatbotx.io/event-bus"
import messageEventListener from "./message"

startWorker([messageEventListener])

let isShuttingDown = false
async function shutdown(signal: "SIGINT" | "SIGTERM") {
  if (isShuttingDown) {
    console.log(`[EventWorker] Already shutting down, ignoring ${signal}`)
    return
  }

  isShuttingDown = true

  try {
    await stopWorker()
    process.exit(0)
  } catch (error) {
    console.error("[EventWorker] Error during shutdown", error)
    process.exit(1)
  }
}

process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)

process.on("uncaughtException", (error) => {
  console.error("[EventWorker] Uncaught exception", error)
  shutdown("SIGTERM")
})

process.on("unhandledRejection", (reason) => {
  console.error("[EventWorker] Unhandled rejection", reason)
  shutdown("SIGTERM")
})
