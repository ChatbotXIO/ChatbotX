import { runWorker } from "../lib/shutdown"
import { startMarketingMessageWorker } from "./consumer"

function startWorker() {
  startMarketingMessageWorker()
}

runWorker("marketing-message", startWorker)
