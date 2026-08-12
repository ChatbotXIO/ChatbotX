import {
  AdsConversionJobAction,
  type AdsConversionJobData,
  defaultWorkerOptions,
  getRedisConnection,
  queueNames,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"
import { handleEvaluateConversionTrigger } from "./handlers/evaluate-conversion-trigger"
import { handleEvaluateTemplateSent } from "./handlers/evaluate-template-sent"
import { handleSendConversionEvent } from "./handlers/send-conversion-event"
import { handleSyncRetargetAudience } from "./handlers/sync-retarget-audience"

async function startAdsConversionWorker() {
  try {
    await ensureBootstrapped()
  } catch (err) {
    logger.error({ err }, "Failed to bootstrap ads conversion worker")
    process.exit(1)
  }

  const worker = new Worker(
    queueNames.enum.adsConversion,
    async (job: Job<AdsConversionJobData>) => {
      logger.info(job.data, `Ads conversion worker received job: ${job.id}`)

      switch (job.data.type) {
        case AdsConversionJobAction.evaluateTemplateSent:
          await handleEvaluateTemplateSent(job.data.data)
          return
        case AdsConversionJobAction.evaluateConversionTrigger:
          await handleEvaluateConversionTrigger(job.data.data)
          return
        case AdsConversionJobAction.sendConversionEvent:
          await handleSendConversionEvent(job.data.data)
          return
        case AdsConversionJobAction.syncRetargetAudience:
          await handleSyncRetargetAudience(job.data.data)
          return
        default:
          // Rolling deploys run old and new worker code side by side against the
          // same monorepo-shared queue. An old worker instance can dequeue a job
          // type it doesn't recognize yet — throwing (instead of logging and
          // dropping) lets BullMQ retry/backoff it until a newer worker picks it
          // up, rather than silently losing the job.
          throw new Error(
            `Unhandled ads conversion job type: ${(job.data as AdsConversionJobData).type}`,
          )
      }
    },
    {
      connection: getRedisConnection(),
      ...defaultWorkerOptions,
    },
  )

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "Ads conversion job failed")
  })

  let isShuttingDown = false
  async function shutdown() {
    if (isShuttingDown) {
      return
    }
    isShuttingDown = true
    try {
      await worker.close()
      process.exit(0)
    } catch (err) {
      logger.error(err, "[AdsConversionWorker] Error during shutdown")
      process.exit(1)
    }
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}

startAdsConversionWorker().catch((err) => {
  logger.error({ err }, "Failed to start ads conversion worker")
  process.exit(1)
})
