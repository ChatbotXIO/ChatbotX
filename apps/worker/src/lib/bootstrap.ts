import { assertLicenseAtStartup } from "@chatbotx.io/business/license-startup"
import {
  initErrorTracking,
  startMetricsServer,
} from "@chatbotx.io/observability"
import { logger } from "./logger"
import { registerWorkerQueueMetrics } from "./queue-metrics"

async function bootstrapApp(): Promise<void> {
  initErrorTracking({ service: "worker" })
  await assertLicenseAtStartup()
  try {
    if (await startMetricsServer()) {
      registerWorkerQueueMetrics()
    }
  } catch (error) {
    logger.error({ err: error }, "Worker metrics server failed to start")
  }
}

let bootstrapPromise: Promise<void> | null = null

export async function ensureBootstrapped(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = Promise.resolve().then(() => bootstrapApp())
  }

  await bootstrapPromise
}
