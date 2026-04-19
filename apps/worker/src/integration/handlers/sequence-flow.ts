import { and, db, eq } from "@chatbotx.io/database/client"
import { sequenceDispatchModel } from "@chatbotx.io/database/schema"
import { sequenceConnections } from "@chatbotx.io/redis"
import { SchedulerClient } from "@chatbotx.io/scheduler"
import { advanceEnrollment } from "@chatbotx.io/sequence-scheduler"
import type { IntegrationJobSendSequenceFlow } from "@chatbotx.io/worker-config"
import type { Job } from "bullmq"
import { logger } from "../../lib/logger"
import { StepExecutorService } from "../../sequence-scheduler/services/step-executor.service"
import { sendFlowDirect } from "./send-flow-direct"

type SendSequenceFlowData = IntegrationJobSendSequenceFlow["data"]

let schedulerClient: SchedulerClient | null = null
const stepExecutor = new StepExecutorService()

async function getSchedulerClient(): Promise<SchedulerClient> {
  if (!schedulerClient) {
    const redis = await sequenceConnections.useExisting()
    schedulerClient = new SchedulerClient(redis)
  }
  return schedulerClient
}

async function fetchDispatch(dispatchId: string, workspaceId: string) {
  return await db.query.sequenceDispatchModel.findFirst({
    where: {
      id: dispatchId,
      workspaceId,
    },
  })
}

async function markDispatchCompleted(
  dispatchId: string,
  workspaceId: string,
  sentAt: Date,
): Promise<void> {
  await db
    .update(sequenceDispatchModel)
    .set({
      status: "completed",
      completedAt: sentAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sequenceDispatchModel.id, dispatchId),
        eq(sequenceDispatchModel.workspaceId, workspaceId),
      ),
    )
}

async function markDispatchCanceled(
  dispatchId: string,
  workspaceId: string,
  reason: string,
): Promise<void> {
  await db
    .update(sequenceDispatchModel)
    .set({
      status: "canceled",
      lastError: reason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sequenceDispatchModel.id, dispatchId),
        eq(sequenceDispatchModel.workspaceId, workspaceId),
      ),
    )
}

async function markDispatchFailed(
  dispatchId: string,
  workspaceId: string,
  errorMessage: string,
): Promise<void> {
  await db
    .update(sequenceDispatchModel)
    .set({
      status: "failed",
      lastError: errorMessage,
      failedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sequenceDispatchModel.id, dispatchId),
        eq(sequenceDispatchModel.workspaceId, workspaceId),
      ),
    )
}

async function runSendSequenceFlow(data: SendSequenceFlowData): Promise<void> {
  const { dispatchId, workspaceId, stepId, bucket, contactId, sequenceId } =
    data

  const dispatch = await fetchDispatch(dispatchId, workspaceId)
  if (!dispatch) {
    return
  }

  const step = await stepExecutor.fetchStep(stepId)
  const validation = stepExecutor.validateStep(step)
  const scheduler = await getSchedulerClient()

  if (!validation.valid) {
    await markDispatchCanceled(dispatchId, workspaceId, validation.reason)

    if (step) {
      await advanceEnrollment({
        enrollmentId: data.enrollmentId,
        workspaceId,
        sequenceId,
        contactId,
        currentStep: { id: step.id, order: step.order },
        sentAt: new Date(),
        scheduler,
      })
    }

    await scheduler.removeFromSchedule(bucket, dispatchId)
    return
  }

  const validStep = validation.step
  const completedAt = dispatch.completedAt

  let sentAt: Date
  if (completedAt) {
    sentAt = completedAt
  } else {
    if (!validStep.flow) {
      throw new Error(`Step ${validStep.id} has no flow configured`)
    }

    await sendFlowDirect({
      flowId: validStep.flow.id,
      workspaceId,
      contactId: data.contactId,
      metadata: data.metadata,
    })

    sentAt = new Date()
    await markDispatchCompleted(dispatchId, workspaceId, sentAt)
  }

  await advanceEnrollment({
    enrollmentId: data.enrollmentId,
    workspaceId,
    sequenceId,
    contactId,
    currentStep: { id: validStep.id, order: validStep.order },
    sentAt,
    scheduler,
  })

  await scheduler.removeFromSchedule(bucket, dispatchId)
}

async function safeTerminalCleanup(
  data: SendSequenceFlowData,
  err: unknown,
  job: Job,
): Promise<void> {
  const { dispatchId, workspaceId, bucket } = data
  const message = err instanceof Error ? err.message : "Unknown error"

  try {
    await markDispatchFailed(dispatchId, workspaceId, message)
  } catch (error) {
    logger.error(
      { error, dispatchId, jobId: job.id },
      "markDispatchFailed failed in terminal cleanup",
    )
  }

  try {
    const scheduler = await getSchedulerClient()
    await scheduler.removeFromSchedule(bucket, dispatchId)
  } catch (error) {
    logger.error(
      { error, dispatchId, jobId: job.id },
      "removeFromSchedule failed in terminal cleanup",
    )
  }
}

export async function handleSendSequenceFlow(
  data: SendSequenceFlowData,
  job: Job,
): Promise<void> {
  try {
    await runSendSequenceFlow(data)
  } catch (err) {
    const maxAttempts = job.opts.attempts ?? 1
    const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts

    logger.error(
      {
        err,
        dispatchId: data.dispatchId,
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        isFinalAttempt,
      },
      "sendSequenceFlow handler failed",
    )

    if (isFinalAttempt) {
      await safeTerminalCleanup(data, err, job)
    }

    throw err
  }
}
