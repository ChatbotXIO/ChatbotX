import type { Readable } from "node:stream"
import { SEQUENCE_SCHEDULE_PAYLOAD_TYPE } from "@chatbotx.io/flow-config"
import {
  type Consumer,
  createConsumer,
  ensureTopicExists,
} from "@chatbotx.io/kafka"
import { sequenceConnections } from "@chatbotx.io/redis"
import { SchedulerClient } from "@chatbotx.io/scheduler"
import pLimit, { type LimitFunction } from "p-limit"
import { logger } from "../lib/logger"
import {
  CONSUMER_CLIENT_ID,
  CONSUMER_GROUP_ID,
  HEARTBEAT_INTERVAL_IN_MS,
  KAFKA_PARTITIONS,
  KAFKA_REPLICATION_FACTOR,
  KAFKA_TOPIC,
  MAX_PROCESS,
  MAX_RETRIES,
  MAX_WAIT_TIME_IN_MS,
  SESSION_TIMEOUT_IN_MS,
} from "./services/constants"
import { DispatchProcessorService } from "./services/dispatch-processor.service"
import { EnrollmentAdvancerService } from "./services/enrollment-advancer.service"
import { RetrySchedulerService } from "./services/retry-scheduler.service"
import { StepExecutorService } from "./services/step-executor.service"
import type {
  ConsumerConfig,
  DispatchMessage,
  DispatchWithRelations,
  StepWithRelations,
} from "./services/types"

class DispatchConsumer {
  private running = false
  private consumer: Consumer<string, string, string, string> | null = null
  private stream: Readable | null = null
  private _scheduler: SchedulerClient | null = null
  private readonly config: ConsumerConfig
  private readonly limitProcess: LimitFunction

  private readonly dispatchProcessor: DispatchProcessorService
  private readonly stepExecutor: StepExecutorService
  private readonly enrollmentAdvancer: EnrollmentAdvancerService
  private readonly retryScheduler: RetrySchedulerService

  private get scheduler(): SchedulerClient {
    if (!this._scheduler) {
      throw new Error("Scheduler not initialized. Call start() first.")
    }
    return this._scheduler
  }

  constructor(config: Partial<ConsumerConfig> = {}) {
    this.config = {
      groupId: config.groupId || CONSUMER_GROUP_ID,
      maxWaitTimeInMs: config.maxWaitTimeInMs || MAX_WAIT_TIME_IN_MS,
      sessionTimeout: config.sessionTimeout || SESSION_TIMEOUT_IN_MS,
      heartbeatInterval: config.heartbeatInterval || HEARTBEAT_INTERVAL_IN_MS,
      maxProcess: config.maxProcess || MAX_PROCESS,
    }

    this.limitProcess = pLimit(this.config.maxProcess)

    this.dispatchProcessor = new DispatchProcessorService()
    this.stepExecutor = new StepExecutorService()
    this.enrollmentAdvancer = new EnrollmentAdvancerService()
    this.retryScheduler = new RetrySchedulerService()
  }

  async start() {
    if (this.running) {
      return
    }

    const redisClient = await sequenceConnections.useExisting()
    this._scheduler = new SchedulerClient(redisClient)

    this.consumer = createConsumer(CONSUMER_CLIENT_ID, this.config.groupId)

    await ensureTopicExists(
      CONSUMER_CLIENT_ID,
      KAFKA_TOPIC,
      KAFKA_PARTITIONS,
      KAFKA_REPLICATION_FACTOR,
    )

    this.stream = await this.consumer.consume({
      topics: [KAFKA_TOPIC],
      autocommit: true,
      sessionTimeout: this.config.sessionTimeout,
      heartbeatInterval: this.config.heartbeatInterval,
    })
    const stream = this.stream

    this.running = true

    for await (const message of stream) {
      if (!this.running) {
        break
      }

      try {
        const payload = JSON.parse(message.value || "{}")
        await this.limitProcess(() => this.processDispatch(payload))
      } catch (error) {
        logger.error({ error, message }, "Error processing dispatch message")
      }
    }

    this.stream = null
  }

  private async processDispatch(payload: DispatchMessage) {
    try {
      await this.scheduler.withLock(
        payload.bucket,
        payload.dispatchId,
        30,
        async () => {
          const dispatch = await this.dispatchProcessor.fetchDispatch(
            payload.dispatchId,
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
      logger.error({ error, payload }, "Error processing dispatch")
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
        return
      }
      const sentAt = await this.stepExecutor.sendFlowMessage(
        dispatch,
        step as StepWithRelations,
        {
          metadata: {
            type: SEQUENCE_SCHEDULE_PAYLOAD_TYPE,
            sequenceStepId: step?.id ?? "",
            sequenceId: step?.sequenceId ?? "",
            dispatchId: dispatch.id,
            contactInboxId: dispatch.contactInboxId,
          },
        },
      )

      await this.stepExecutor.markDispatchCompleted(
        dispatch.id,
        dispatch.workspaceId,
        sentAt,
      )

      await this.advanceEnrollment(dispatch, step as StepWithRelations, sentAt)
    } catch (error) {
      logger.error(
        { error, dispatchId: dispatch.id, attempt: dispatch.attempt },
        "Error executing step",
      )

      try {
        if (dispatch.attempt < MAX_RETRIES) {
          await this.retryScheduler.scheduleRetry(
            dispatch,
            error,
            this.scheduler,
          )
        } else {
          await this.retryScheduler.markDispatchFailed(
            dispatch.id,
            dispatch.workspaceId,
            error instanceof Error ? error.message : "Unknown error",
          )
        }
      } catch (retryError) {
        logger.error(
          { retryError, dispatchId: dispatch.id },
          "Failed to handle dispatch error",
        )
      }
    }
  }

  private async advanceEnrollment(
    dispatch: DispatchWithRelations,
    step: StepWithRelations,
    sentAt: Date,
  ) {
    const enrollment = await this.enrollmentAdvancer.fetchEnrollment(
      dispatch.enrollmentId,
      dispatch.workspaceId,
    )

    if (!enrollment) {
      throw new Error(`Enrollment ${dispatch.enrollmentId} not found`)
    }

    if (enrollment.status !== "active") {
      return
    }

    if (enrollment.lastStepId === step.id) {
      return
    }

    const nextStep = await this.enrollmentAdvancer.findNextStep(
      dispatch.sequenceId,
      step.order,
    )

    if (!nextStep) {
      await this.enrollmentAdvancer.completeEnrollment(
        dispatch.enrollmentId,
        dispatch.workspaceId,
        step,
        sentAt,
      )
      return
    }

    await this.enrollmentAdvancer.advanceToNextStep(
      dispatch,
      step,
      nextStep,
      sentAt,
      this.scheduler,
    )
  }

  async stop() {
    if (!this.running) {
      return
    }

    this.running = false

    if (this.stream) {
      this.stream.destroy()
      this.stream = null
    }

    if (this.consumer) {
      await this.consumer.close()
    }
  }
}

const consumer = new DispatchConsumer()

let isShuttingDown = false

async function startDispatchConsumer() {
  console.log("Starting dispatch consumer...")

  try {
    await consumer.start()
    console.log("Dispatch consumer fully operational")
  } catch (error) {
    console.error("Error starting dispatch consumer:", error)
    throw error
  }
}

async function stopDispatchConsumer() {
  console.log("Stopping dispatch consumer...")

  try {
    await consumer.stop()
    console.log("Dispatch consumer stopped")
  } catch (error) {
    console.error("Error stopping dispatch consumer:", error)
    throw error
  }
}

startDispatchConsumer().catch((error) => {
  console.error("Error starting dispatch consumer:", error)
  process.exitCode = 1
})

const handleShutdownSignal = async (signal: "SIGINT" | "SIGTERM") => {
  if (isShuttingDown) {
    return
  }
  isShuttingDown = true

  console.log(`${signal} received, shutting down dispatch consumer...`)

  try {
    await stopDispatchConsumer()
    process.exit(0)
  } catch (error) {
    console.error("Error during dispatch consumer shutdown:", error)
    process.exit(1)
  }
}

process.on("SIGINT", () => {
  handleShutdownSignal("SIGINT").catch((error) => {
    console.error("Unhandled SIGINT shutdown error:", error)
    process.exit(1)
  })
})

process.on("SIGTERM", () => {
  handleShutdownSignal("SIGTERM").catch((error) => {
    console.error("Unhandled SIGTERM shutdown error:", error)
    process.exit(1)
  })
})
