import { runWithWebhookExecutionContext } from "@chatbotx.io/events/context"
import { SdkException } from "@chatbotx.io/sdk"
import {
  defaultWorkerOptions,
  getRedisConnection,
  queueNames,
  TriggerJobAction,
  type TriggerJobData,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { ensureBootstrapped } from "../lib/bootstrap"
import { isBlockedWorkspace } from "../lib/is-blocked-workspace"
import { logger } from "../lib/logger"
import { resolveWorkspaceId } from "../lib/resolve-workspace-id"
import { TriggerExecutorService } from "./services/trigger-executor.service"
import { TriggerMatcherService } from "./services/trigger-matcher.service"
import type { TriggerEventData } from "./types"

const triggerMatcher = new TriggerMatcherService()
const triggerExecutor = new TriggerExecutorService()

async function startTriggerWorker() {
  try {
    await ensureBootstrapped()
    logger.info("Trigger worker bootstrapped successfully")
  } catch (err) {
    logger.error(err, "Failed to bootstrap trigger worker")
    process.exit(1)
  }

  const worker = new Worker(
    queueNames.enum.trigger,
    async (job: Job<TriggerJobData>) => {
      if (await isBlockedWorkspace(await resolveWorkspaceId(job.data.data))) {
        return
      }

      switch (job.data.type) {
        case TriggerJobAction.evaluateTriggers: {
          const { data: eventData } = job.data

          if (eventData.source === "worker") {
            logger.info("Skipping worker-emitted event to prevent loop")
            return
          }

          const matchedTriggers = await triggerMatcher.findMatchingTriggers(
            eventData as TriggerEventData,
          )

          if (matchedTriggers.length === 0) {
            return
          }

          logger.info(
            `Found ${matchedTriggers.length} triggers for event type ${eventData.eventType}`,
          )

          await runWithWebhookExecutionContext(
            eventData.channelOriginated ? { source: "webhook" } : {},
            () =>
              Promise.allSettled(
                matchedTriggers.map((trigger) =>
                  triggerExecutor.execute(trigger, eventData.contactId),
                ),
              ),
          )
          return
        }

        default:
          throw new SdkException("TriggerJobAction action is not defined")
      }
    },
    {
      connection: getRedisConnection(),
      ...defaultWorkerOptions,
      concurrency: 100,
    },
  )

  worker.on("failed", (job, err) => {
    if (job) {
      logger.error(err, `Trigger job ${job.id} has failed`)
    }
  })

  worker.on("completed", (job) => {
    logger.info(`Trigger job ${job.id} completed successfully`)
  })

  logger.info("Trigger worker started")

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
      logger.error(err, "[TriggerWorker] Error during shutdown")
      process.exit(1)
    }
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}

startTriggerWorker()
