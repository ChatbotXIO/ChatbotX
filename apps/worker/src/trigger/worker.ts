import { SdkException } from "@aha.chat/sdk"
import {
  defaultWorkerOptions,
  getRedisConnection,
  queueName,
  TriggerJobAction,
  type TriggerJobData,
} from "@aha.chat/worker-config"
import { type Job, Worker } from "bullmq"
import { logger } from "../lib/logger"
import { TriggerExecutorService } from "./services/trigger-executor.service"
import { TriggerMatcherService } from "./services/trigger-matcher.service"
import type { TriggerEventData } from "./types"

const triggerMatcher = new TriggerMatcherService()
const triggerExecutor = new TriggerExecutorService()

const worker = new Worker(
  queueName.trigger,
  async (job: Job<TriggerJobData>) => {
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

        await Promise.allSettled(
          matchedTriggers.map((trigger) =>
            triggerExecutor.execute(trigger, eventData.contactId),
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
