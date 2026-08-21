import { SEQUENCE_SCHEDULE_PAYLOAD_TYPE } from "@chatbotx.io/flow-config"
import { sequenceConnections } from "@chatbotx.io/redis"
import { SchedulerClient } from "@chatbotx.io/scheduler"
import { advanceEnrollment } from "@chatbotx.io/sequence-scheduler"
import {
  IntegrationJobAction,
  integrationQueue,
  type MessagingConsumer,
  SEQUENCE_SCHEDULER_QUEUE_NAME,
} from "@chatbotx.io/worker-config"
import { createConsumer } from "@chatbotx.io/worker-config/message-queue/factory"
import pLimit, { type LimitFunction } from "p-limit"
import { ensureBootstrapped } from "../lib/bootstrap"
import { isBlockedWorkspace } from "../lib/is-blocked-workspace"
import { logger } from "../lib/logger"
import { revertDispatchToPending } from "./revert-dispatch"
import { MAX_PROCESS } from "./services/constants"
import { DispatchProcessorService } from "./services/dispatch-processor.service"
import { RetrySchedulerService } from "./services/retry-scheduler.service"
import { StepExecutorService } from "./services/step-executor.service"
import type { DispatchMessage, DispatchWithRelations } from "./services/types"

interface ConsumerOptions {
  maxProcess: number
}

class DispatchConsumer {
  private running = false
  private consumer: MessagingConsumer | null = null
  private _scheduler: SchedulerClient | null = null
  private readonly options: ConsumerOptions
  private readonly limitProcess: LimitFunction

  private readonly dispatchProcessor: DispatchProcessorService
  private readonly stepExecutor: StepExecutorService
  private readonly retryScheduler: RetrySchedulerService

  private get scheduler(): SchedulerClient {
    if (!this._scheduler) {
      throw new Error("Scheduler not initialized. Call start() first.")
    }
    return this._scheduler
  }

  constructor(options: Partial<ConsumerOptions> = {}) {
    this.options = {
      maxProcess: options.maxProcess || MAX_PROCESS,
    }

    this.limitProcess = pLimit(this.options.maxProcess)

    this.dispatchProcessor = new DispatchProcessorService()
    this.stepExecutor = new StepExecutorService()
    this.retryScheduler = new RetrySchedulerService()
  }

  async start() {
    if (this.running) {
      return
    }

    const redisClient = await sequenceConnections.useExisting()
    this._scheduler = new SchedulerClient(redisClient)

    this.consumer = await createConsumer({
      topic: SEQUENCE_SCHEDULER_QUEUE_NAME,
      clientId: "sequence-dispatch-consumer",
      groupId: "sequence-dispatch-consumer",
    })

    this.running = true
    logger.info("Dispatch consumer fully operational")

    await this.consumer.consume(async (value: string) => {
      if (!this.running) {
        return
      }

      try {
        const payload = JSON.parse(value || "{}") as Partial<DispatchMessage>
        if (!payload.workspaceId) {
          logger.warn(
            { payload },
            "Skipping sequence dispatch message without workspaceId",
          )
          return
        }
        await this.limitProcess(() =>
          this.processDispatch(payload as DispatchMessage),
        )
      } catch (error) {
        logger.error(error, "Error processing dispatch message")
        logger.error({ value }, "Error processing dispatch message value")
      }
    })
  }

  private async processDispatch(payload: DispatchMessage) {
    try {
      if (await isBlockedWorkspace(payload.workspaceId)) {
        return
      }

      await this.scheduler.withLock(
        payload.bucket,
        payload.dispatchId,
        30,
        async () => {
          const dispatch = await this.dispatchProcessor.fetchDispatch(
            payload.dispatchId,
            "pending",
            payload.workspaceId,
          )

          if (!dispatch || dispatch === null) {
            await this.scheduler.removeFromSchedule(
              payload.bucket,
              payload.dispatchId,
            )
            return
          }

          if (!this.dispatchProcessor.validateDispatch(dispatch)) {
            return
          }

          if (!this.dispatchProcessor.isDispatchReady(dispatch)) {
            await this.scheduler.addToSchedule(
              dispatch.bucket,
              payload.dispatchId,
              Number(dispatch.runAtMs),
            )
            return
          }

          const locked = await this.dispatchProcessor.lockDispatch(dispatch)
          if (!locked) {
            return
          }

          await this.executeStep(dispatch)
        },
      )
    } catch (error) {
      logger.error(error, "Error processing dispatch")
      logger.error({ payload }, "Error processing dispatch payload")
    }
  }

  private async executeStep(dispatch: DispatchWithRelations) {
    try {
      const step = await this.stepExecutor.fetchStep(dispatch.stepId)
      const validation = this.stepExecutor.validateStep(step)

      if (!validation.valid) {
        await this.retryScheduler.markDispatchCanceled(
          dispatch.id,
          dispatch.workspaceId,
          validation.reason,
        )

        if (step) {
          await advanceEnrollment({
            enrollmentId: dispatch.enrollmentId,
            workspaceId: dispatch.workspaceId,
            sequenceId: dispatch.sequenceId,
            contactId: dispatch.contactId,
            currentStep: { id: step.id, order: step.order },
            sentAt: new Date(),
            scheduler: this.scheduler,
          })
        }

        await this.scheduler.removeFromSchedule(dispatch.bucket, dispatch.id)
        return
      }

      await integrationQueue.add(
        IntegrationJobAction.sendSequenceFlow,
        {
          type: IntegrationJobAction.sendSequenceFlow,
          data: {
            dispatchId: dispatch.id,
            workspaceId: dispatch.workspaceId,
            stepId: dispatch.stepId,
            contactId: dispatch.contactId,
            contactInboxId: dispatch.contactInboxId,
            enrollmentId: dispatch.enrollmentId,
            sequenceId: dispatch.sequenceId,
            bucket: dispatch.bucket,
            metadata: {
              type: SEQUENCE_SCHEDULE_PAYLOAD_TYPE,
              sequenceStepId: step?.id ?? "",
              sequenceId: step?.sequenceId ?? "",
              dispatchId: dispatch.id,
              contactInboxId: dispatch.contactInboxId,
            },
          },
        },
        {
          jobId: `seq-${dispatch.id}-${dispatch.attempt}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: true,
        },
      )
    } catch (error) {
      logger.error(
        { error, dispatchId: dispatch.id },
        "Failed to enqueue sendSequenceFlow; reverting dispatch",
      )

      await revertDispatchToPending(dispatch.id, dispatch.workspaceId)
    }
  }

  async stop() {
    if (!this.running) {
      return
    }

    this.running = false

    if (this.consumer) {
      await this.consumer.close()
      this.consumer = null
    }
  }
}

const consumer = new DispatchConsumer()

let isShuttingDown = false

async function startDispatchConsumer() {
  logger.info("Starting dispatch consumer")

  try {
    await ensureBootstrapped()
    await consumer.start()
  } catch (error) {
    logger.error(error, "Error starting dispatch consumer")
    throw error
  }
}

async function stopDispatchConsumer() {
  logger.info("Stopping dispatch consumer")

  try {
    await consumer.stop()
    logger.info("Dispatch consumer stopped")
  } catch (error) {
    logger.error(error, "Error stopping dispatch consumer")
    throw error
  }
}

startDispatchConsumer().catch((error) => {
  logger.error(error, "Error starting dispatch consumer")
  process.exitCode = 1
})

const handleShutdownSignal = async (signal: "SIGINT" | "SIGTERM") => {
  if (isShuttingDown) {
    return
  }
  isShuttingDown = true

  logger.info({ signal }, "Shutdown signal received")

  try {
    await stopDispatchConsumer()
    process.exit(0)
  } catch (error) {
    logger.error(error, "Error during dispatch consumer shutdown")
    process.exit(1)
  }
}

process.on("SIGINT", () => {
  handleShutdownSignal("SIGINT").catch((error) => {
    logger.error(error, "Unhandled SIGINT shutdown error")
    process.exit(1)
  })
})

process.on("SIGTERM", () => {
  handleShutdownSignal("SIGTERM").catch((error) => {
    logger.error(error, "Unhandled SIGTERM shutdown error")
    process.exit(1)
  })
})
