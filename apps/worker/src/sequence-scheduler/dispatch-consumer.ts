import { and, db, eq } from "@aha.chat/database/client"
import {
  contactsOnSequenceModel,
  sequenceDispatchModel,
  sequenceEventModel,
} from "@aha.chat/database/schema"
import { getDragonflyClient } from "@aha.chat/scheduler"
import {
  calculateNextRunAtFromStep,
  calculateNextValidSendTime,
  createDispatch,
} from "@aha.chat/sequence-scheduler"
import { createId } from "@paralleldrive/cuid2"
import { type Consumer, Kafka } from "kafkajs"
import pLimit, { type LimitFunction } from "p-limit"
import { sendFlowDirect } from "../integration/handlers/send-flow-direct"
import { logger } from "../lib/logger"

const MAX_WAIT_TIME_IN_MS = 100
const SESSION_TIMEOUT_IN_MS = 30_000
const HEARTBEAT_INTERVAL_IN_MS = 3000
const MAX_PROCESS = 10
const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 60_000

interface ConsumerConfig {
  groupId: string
  heartbeatInterval: number
  maxProcess: number
  maxWaitTimeInMs: number
  sessionTimeout: number
}

type DispatchWithRelations = Awaited<
  ReturnType<
    typeof db.query.sequenceDispatchModel.findFirst<{
      with: { sequence: true; contact: true; enrollment: true }
    }>
  >
>

type StepWithRelations = Awaited<
  ReturnType<
    typeof db.query.sequenceStepModel.findFirst<{
      with: { flow: true }
    }>
  >
> & {}

type DispatchMessage = {
  dispatchId: string
  claimedAt: number
  bucket: number
}

export class DispatchConsumer {
  private running = false
  private readonly kafka: Kafka
  private readonly consumer: Consumer
  private readonly dragonfly = getDragonflyClient()
  private readonly config: ConsumerConfig
  private readonly limitProcess: LimitFunction

  constructor(config: Partial<ConsumerConfig> = {}) {
    this.config = {
      groupId: config.groupId || "sequence-dispatch-consumer",
      maxWaitTimeInMs: config.maxWaitTimeInMs || MAX_WAIT_TIME_IN_MS,
      sessionTimeout: config.sessionTimeout || SESSION_TIMEOUT_IN_MS,
      heartbeatInterval: config.heartbeatInterval || HEARTBEAT_INTERVAL_IN_MS,
      maxProcess: config.maxProcess || MAX_PROCESS,
    }

    this.limitProcess = pLimit(this.config.maxProcess)

    const kafkaBrokers = (process.env.KAFKA_BROKERS || "localhost:9092").split(
      ",",
    )

    const sasl =
      process.env.KAFKA_SASL_USERNAME && process.env.KAFKA_SASL_PASSWORD
        ? {
            mechanism: "plain" as const,
            username: process.env.KAFKA_SASL_USERNAME,
            password: process.env.KAFKA_SASL_PASSWORD,
          }
        : undefined

    this.kafka = new Kafka({
      clientId: "sequence-dispatch-consumer",
      brokers: kafkaBrokers,
      ssl: process.env.KAFKA_SSL_ENABLED === "true",
      sasl,
      retry: {
        retries: 5,
        initialRetryTime: 300,
        maxRetryTime: 30_000,
      },
    })

    this.consumer = this.kafka.consumer({
      groupId: this.config.groupId,
      sessionTimeout: this.config.sessionTimeout,
      heartbeatInterval: this.config.heartbeatInterval,
      maxWaitTimeInMs: this.config.maxWaitTimeInMs,
    })
  }

  async start() {
    if (this.running) {
      logger.warn("Dispatch consumer already running")
      return
    }

    logger.info("Starting dispatch consumer...")

    await this.consumer.connect()
    await this.consumer.subscribe({
      topic: "seq.dispatch.run",
      fromBeginning: false,
    })

    await this.consumer.run({
      autoCommit: true,
      eachMessage: async ({ message }) => {
        try {
          const payload = JSON.parse(message.value?.toString() || "{}")
          await this.limitProcess(() => this.processDispatch(payload))
        } catch (error) {
          logger.error({ error, message }, "Error processing dispatch message")
        }
      },
    })

    this.running = true
    logger.info("Dispatch consumer started")
  }

  private async processDispatch(payload: DispatchMessage) {
    const startTime = Date.now()

    try {
      const dispatch = await db.query.sequenceDispatchModel.findFirst({
        where: {
          id: payload.dispatchId,
        },
        with: {
          sequence: true,
          contact: true,
          enrollment: true,
        },
      })

      if (!dispatch) {
        logger.warn({ dispatchId: payload.dispatchId }, "Dispatch not found")
        return
      }

      if (dispatch.status !== "pending") {
        logger.warn({ dispatchId: payload.dispatchId }, "Dispatch not pending")
        return
      }

      const nowMs = Date.now()
      const runAt = Number(dispatch.runAtMs)

      if (runAt > nowMs + 1000) {
        logger.warn({ dispatchId: payload.dispatchId }, "Dispatch not ready")
        await this.dragonfly.addToSchedule(
          dispatch.bucket,
          payload.dispatchId,
          runAt,
        )
        return
      }

      const updated = await db
        .update(sequenceDispatchModel)
        .set({
          status: "running",
          lockedAt: new Date(),
          lockOwner: process.env.HOSTNAME || "unknown",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(sequenceDispatchModel.id, dispatch.id),
            eq(sequenceDispatchModel.chatbotId, dispatch.chatbotId),
            eq(sequenceDispatchModel.status, "pending"),
          ),
        )
        .returning({ id: sequenceDispatchModel.id })

      if (updated.length === 0) {
        logger.warn({ dispatchId: payload.dispatchId }, "Dispatch not acquired")
        return
      }

      await this.executeStep(dispatch)

      const duration = Date.now() - startTime
      logger.info(
        {
          dispatchId: payload.dispatchId,
          duration,
          contactId: dispatch.contactId,
        },
        "Dispatch completed successfully",
      )
    } catch (error) {
      logger.error({ error, payload }, "Error processing dispatch")

      try {
        await this.dragonfly.releaseLock(payload.bucket, payload.dispatchId)
      } catch (lockError) {
        logger.error(
          { lockError, dispatchId: payload.dispatchId },
          "Error releasing lock",
        )
      }
    }
  }

  private async executeStep(dispatch: NonNullable<DispatchWithRelations>) {
    try {
      const step = await db.query.sequenceStepModel.findFirst({
        where: {
          id: dispatch.stepId,
        },
        with: { flow: true },
      })

      if (!step) {
        throw new Error(`Step ${dispatch.stepId} not found`)
      }

      if (!step.isActive) {
        logger.warn(
          { dispatchId: dispatch.id, stepId: step.id },
          "Step is not active, skipping",
        )
        await this.markDispatchCanceled(
          dispatch.id,
          dispatch.chatbotId,
          "step_inactive",
        )
        await this.dragonfly.releaseLock(dispatch.bucket, dispatch.id)
        return
      }

      if (!step.flow) {
        throw new Error(`Step ${dispatch.stepId} has no flow configured`)
      }

      // console.log("step", step)
      const sentAt = await this.sendFlowMessage(dispatch, step)

      await db
        .update(sequenceDispatchModel)
        .set({
          status: "completed",
          completedAt: sentAt,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(sequenceDispatchModel.id, dispatch.id),
            eq(sequenceDispatchModel.chatbotId, dispatch.chatbotId),
          ),
        )

      await db.insert(sequenceEventModel).values({
        id: createId(),
        chatbotId: dispatch.chatbotId,
        sequenceId: dispatch.sequenceId,
        contactId: dispatch.contactId,
        stepId: dispatch.stepId,
        dispatchId: dispatch.id,
        eventType: "dispatch_completed",
        payload: {
          attempt: dispatch.attempt,
          duration: Date.now() - Number(dispatch.runAtMs),
        },
        occurredAt: sentAt,
      })

      await this.advanceEnrollment(dispatch, step, sentAt)

      await this.dragonfly.releaseLock(dispatch.bucket, dispatch.id)
    } catch (error) {
      logger.error(
        { error, dispatchId: dispatch.id, attempt: dispatch.attempt },
        "Error executing step",
      )

      try {
        if (dispatch.attempt < MAX_RETRIES) {
          await this.scheduleRetry(dispatch, error)
        } else {
          await this.markDispatchFailed(
            dispatch.id,
            dispatch.chatbotId,
            error instanceof Error ? error.message : "Unknown error",
          )

          await db.insert(sequenceEventModel).values({
            id: createId(),
            chatbotId: dispatch.chatbotId,
            sequenceId: dispatch.sequenceId,
            contactId: dispatch.contactId,
            stepId: dispatch.stepId,
            dispatchId: dispatch.id,
            eventType: "dispatch_failed",
            payload: {
              attempt: dispatch.attempt,
              error: error instanceof Error ? error.message : "Unknown error",
            },
            occurredAt: new Date(),
          })
        }
      } catch (retryError) {
        logger.error(
          { retryError, dispatchId: dispatch.id },
          "Failed to handle dispatch error",
        )
      }

      try {
        await this.dragonfly.releaseLock(dispatch.bucket, dispatch.id)
      } catch (lockError) {
        logger.error(
          { lockError, dispatchId: dispatch.id },
          "Failed to release lock after error",
        )
      }
    }
  }

  private async advanceEnrollment(
    dispatch: NonNullable<DispatchWithRelations>,
    step: NonNullable<StepWithRelations>,
    sentAt: Date,
  ) {
    await db.transaction(async (tx) => {
      const enrollment = await tx.query.contactsOnSequenceModel.findFirst({
        where: {
          id: dispatch.enrollmentId,
          chatbotId: dispatch.chatbotId,
        },
      })

      if (!enrollment) {
        throw new Error(`Enrollment ${dispatch.enrollmentId} not found`)
      }

      if (enrollment.status !== "active") {
        logger.warn(
          {
            enrollmentId: dispatch.enrollmentId,
            status: enrollment.status,
          },
          "Enrollment not active, skipping advancement",
        )
        return
      }

      if (enrollment.lastStepId === step.id) {
        logger.warn(
          {
            enrollmentId: dispatch.enrollmentId,
            stepId: step.id,
          },
          "Step already processed (duplicate), skipping",
        )
        return
      }

      const nextStep = await tx.query.sequenceStepModel.findFirst({
        where: {
          sequenceId: dispatch.sequenceId,
          order: { gt: step.order },
          isActive: true,
        },
        orderBy: { order: "asc" },
        with: { flow: true },
      })

      if (!nextStep) {
        await tx
          .update(contactsOnSequenceModel)
          .set({
            status: "completed",
            completedAt: sentAt,
            currentStep: step.order + 1,
            lastStepId: step.id,
            nextStepId: null,
            nextRunAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(contactsOnSequenceModel.id, dispatch.enrollmentId),
              eq(contactsOnSequenceModel.chatbotId, dispatch.chatbotId),
            ),
          )

        logger.info(
          { enrollmentId: dispatch.enrollmentId },
          "Enrollment completed",
        )

        return
      }

      const nextRunAt = this.calculateNextRunAt(nextStep, sentAt)

      await tx
        .update(contactsOnSequenceModel)
        .set({
          currentStep: nextStep.order,
          lastStepId: step.id,
          nextStepId: nextStep.id,
          nextRunAt,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(contactsOnSequenceModel.id, dispatch.enrollmentId),
            eq(contactsOnSequenceModel.chatbotId, dispatch.chatbotId),
          ),
        )

      const nextDispatch = await createDispatch({
        chatbotId: dispatch.chatbotId,
        sequenceId: dispatch.sequenceId,
        contactId: dispatch.contactId,
        stepId: nextStep.id,
        enrollmentId: dispatch.enrollmentId,
        runAt: nextRunAt,
        client: tx,
      })

      await this.dragonfly.addToSchedule(
        nextDispatch.bucket,
        nextDispatch.id,
        nextDispatch.runAtMs,
      )

      logger.info(
        {
          enrollmentId: dispatch.enrollmentId,
          nextStepId: nextStep.id,
          nextRunAt,
        },
        "Enrollment advanced to next step",
      )
    })
  }

  private calculateNextRunAt(
    step: NonNullable<StepWithRelations>,
    baseTime: Date,
  ): Date {
    const calculatedTime = calculateNextRunAtFromStep(
      {
        delayDays: step.delayDays,
        delayMinutes: step.delayMinutes,
        delayUnit: step.delayUnit,
        specificDateTime: step.specificDateTime,
      },
      baseTime,
    )

    const validSendTime = calculateNextValidSendTime(calculatedTime, {
      anytime: step.anytime,
      sendTimeStart: step.sendTimeStart,
      sendTimeEnd: step.sendTimeEnd,
      sendDays: step.sendDays,
    })

    return validSendTime
  }

  private async sendFlowMessage(
    dispatch: NonNullable<DispatchWithRelations>,
    step: NonNullable<StepWithRelations>,
  ): Promise<Date> {
    if (!step.flow) {
      throw new Error(`Step ${step.id} has no flow configured`)
    }

    const sentAt = await sendFlowDirect({
      flowId: step.flow.id,
      chatbotId: dispatch.chatbotId,
      contactId: dispatch.contactId,
    })

    logger.info(
      {
        dispatchId: dispatch.id,
        contactId: dispatch.contactId,
        flowId: step.flow.id,
        sentAt,
      },
      "Flow message sent",
    )

    return sentAt
  }

  private async markDispatchFailed(
    dispatchId: string,
    chatbotId: string,
    errorMessage: string,
  ) {
    await db
      .update(sequenceDispatchModel)
      .set({
        status: "failed",
        lastError: errorMessage,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sequenceDispatchModel.id, dispatchId),
          eq(sequenceDispatchModel.chatbotId, chatbotId),
        ),
      )

    logger.error({ dispatchId, errorMessage }, "Dispatch marked as failed")
  }

  private async markDispatchCanceled(
    dispatchId: string,
    chatbotId: string,
    reason: string,
  ) {
    await db
      .update(sequenceDispatchModel)
      .set({
        status: "canceled",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sequenceDispatchModel.id, dispatchId),
          eq(sequenceDispatchModel.chatbotId, chatbotId),
        ),
      )

    logger.info({ dispatchId, reason }, "Dispatch marked as canceled")
  }

  private async scheduleRetry(
    dispatch: NonNullable<DispatchWithRelations>,
    error: unknown,
  ) {
    const nextAttempt = dispatch.attempt + 1
    const retryDelayMs = this.calculateRetryDelay(dispatch.attempt)
    const retryAtMs = Date.now() + retryDelayMs

    await db
      .update(sequenceDispatchModel)
      .set({
        status: "pending",
        attempt: nextAttempt,
        lastError: error instanceof Error ? error.message : "Unknown error",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sequenceDispatchModel.id, dispatch.id),
          eq(sequenceDispatchModel.chatbotId, dispatch.chatbotId),
        ),
      )

    await this.dragonfly.addToRetry(dispatch.bucket, dispatch.id, retryAtMs)

    await db.insert(sequenceEventModel).values({
      id: createId(),
      chatbotId: dispatch.chatbotId,
      sequenceId: dispatch.sequenceId,
      contactId: dispatch.contactId,
      stepId: dispatch.stepId,
      dispatchId: dispatch.id,
      eventType: "dispatch_retry_scheduled",
      payload: {
        attempt: dispatch.attempt,
        nextAttempt,
        retryAtMs,
        retryDelayMs,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      occurredAt: new Date(),
    })

    logger.info(
      {
        dispatchId: dispatch.id,
        attempt: dispatch.attempt,
        nextAttempt,
        retryAtMs: new Date(retryAtMs),
        retryDelayMs,
      },
      "Dispatch scheduled for retry",
    )
  }

  private calculateRetryDelay(attempt: number): number {
    return RETRY_BASE_DELAY_MS * 2 ** attempt
  }

  async stop() {
    if (!this.running) {
      return
    }

    logger.info("Stopping dispatch consumer...")
    this.running = false

    await this.consumer.disconnect()
    logger.info("Dispatch consumer stopped")
  }
}

let dispatchConsumer: DispatchConsumer | null = null

export function getDispatchConsumer() {
  if (!dispatchConsumer) {
    dispatchConsumer = new DispatchConsumer()
  }
  return dispatchConsumer
}
