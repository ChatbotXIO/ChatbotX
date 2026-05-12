import {
  TriggerJobAction,
  type TriggerJobData,
} from "@chatbotx.io/worker-config"
import { createBullMQWorker } from "../lib/create-worker"
import { logger } from "../lib/logger"
import { TriggerExecutorService } from "./services/trigger-executor.service"
import { TriggerMatcherService } from "./services/trigger-matcher.service"
import type { TriggerEventData } from "./types"

const triggerMatcher = new TriggerMatcherService()
const triggerExecutor = new TriggerExecutorService()

const worker = await createBullMQWorker<TriggerJobData>({
  name: "trigger",
  label: "trigger",
  bootstrap: false,
  concurrency: 100,
  handlers: {
    [TriggerJobAction.executeTrigger]: async () => {
      // No direct execution path today; matched triggers fan out via
      // evaluateTriggers below.
    },
    [TriggerJobAction.evaluateTriggers]: async (eventData) => {
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
    },
  },
})

worker.on("completed", (job) => {
  logger.info(`Trigger job ${job.id} completed successfully`)
})

logger.info("Trigger worker started")
