import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  type Transaction,
} from "@chatbotx.io/database/client"
import {
  contactsOnSequenceModel,
  sequenceDispatchModel,
} from "@chatbotx.io/database/schema"
import { sequenceConnections } from "@chatbotx.io/redis"
import { SchedulerClient } from "@chatbotx.io/scheduler"
import { createId } from "@chatbotx.io/utils"
import { createHash } from "crypto"

type DrizzleClient = typeof db | Transaction

export function calculateBucket(
  workspaceId: string,
  contactId: string,
): number {
  const key = `${workspaceId}:${contactId}`
  const hash = createHash("sha256").update(key).digest()
  return hash[0] // First byte gives 0-255
}

export function generateIdempotencyKey(
  workspaceId: string,
  enrollmentId: string,
  stepId: string,
  runAt: Date,
): string {
  return `${workspaceId}:${enrollmentId}:${stepId}:${runAt.toISOString()}`
}
export interface CreateDispatchParams {
  client?: DrizzleClient
  contactId: string
  enrollmentId: string
  runAt: Date
  sequenceId: string
  stepId: string
  workspaceId: string
}
export async function createDispatch(
  params: CreateDispatchParams,
): Promise<{ id: string; bucket: number; runAtMs: number }> {
  const {
    workspaceId,
    sequenceId,
    contactId,
    stepId,
    enrollmentId,
    runAt,
    client = db,
  } = params
  const bucket = calculateBucket(workspaceId, contactId)
  const runAtMs = runAt.getTime()
  const idempotencyKey = generateIdempotencyKey(
    workspaceId,
    enrollmentId,
    stepId,
    runAt,
  )
  const [dispatch] = await client
    .insert(sequenceDispatchModel)
    .values({
      id: createId(),
      workspaceId,
      sequenceId,
      contactId,
      stepId,
      enrollmentId,
      runAtMs,
      bucket,
      idempotencyKey,
      status: "pending",
      attempt: 0,
    })
    .returning({
      id: sequenceDispatchModel.id,
      bucket: sequenceDispatchModel.bucket,
      runAtMs: sequenceDispatchModel.runAtMs,
    })

  if (!dispatch) {
    throw new Error("Failed to create dispatch")
  }

  return dispatch
}
export interface CancelPendingDispatchesParams {
  client?: DatabaseClient
  enrollmentId: string
  reason?: string
  workspaceId: string
}
export async function cancelPendingDispatches(
  params: CancelPendingDispatchesParams,
): Promise<Array<{ id: string; bucket: number }>> {
  const { enrollmentId, workspaceId, reason = "canceled", client = db } = params

  const pendingDispatches = await client.query.sequenceDispatchModel.findMany({
    where: {
      enrollmentId,
      workspaceId,
      status: "pending",
    },
    columns: {
      id: true,
      bucket: true,
      sequenceId: true,
      contactId: true,
      stepId: true,
    },
  })

  if (pendingDispatches.length === 0) {
    return []
  }

  const dispatchIds = pendingDispatches.map((d) => d.id)
  await client
    .update(sequenceDispatchModel)
    .set({
      status: "canceled",
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(sequenceDispatchModel.id, dispatchIds),
        eq(sequenceDispatchModel.workspaceId, workspaceId),
        eq(sequenceDispatchModel.status, "pending"),
      ),
    )

  const redisClient = await sequenceConnections.useExisting()
  const scheduler = new SchedulerClient(redisClient)
  for (const dispatch of pendingDispatches) {
    await scheduler.removeFromSchedule(dispatch.bucket, dispatch.id)
  }

  return pendingDispatches.map((d) => ({
    id: d.id,
    bucket: d.bucket,
  }))
}
export interface RescheduleEnrollmentParams {
  client?: DrizzleClient
  enrollmentId: string
  newNextRunAt: Date
  newStepId: string
  workspaceId: string
}
export async function rescheduleEnrollment(
  params: RescheduleEnrollmentParams,
): Promise<{
  canceled: Array<{ id: string; bucket: number }> | null
  created: { id: string; bucket: number; runAtMs: number } | null
}> {
  const {
    enrollmentId,
    workspaceId,
    newNextRunAt,
    newStepId,
    client = db,
  } = params

  const executeReschedule = async (tx: DrizzleClient) => {
    await tx
      .update(contactsOnSequenceModel)
      .set({
        nextRunAt: newNextRunAt,
        nextStepId: newStepId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contactsOnSequenceModel.id, enrollmentId),
          eq(contactsOnSequenceModel.workspaceId, workspaceId),
        ),
      )

    const currentDispatch = await tx.query.sequenceDispatchModel.findFirst({
      where: {
        enrollmentId,
        workspaceId,
        status: { in: ["pending", "running"] },
      },
      orderBy: (dispatch, { desc }) => [desc(dispatch.runAtMs)],
      columns: {
        id: true,
        bucket: true,
        status: true,
        sequenceId: true,
        contactId: true,
        stepId: true,
      },
    })
    let canceled: Array<{ id: string; bucket: number }> | null = null
    if (currentDispatch && currentDispatch.status === "pending") {
      await tx
        .update(sequenceDispatchModel)
        .set({
          status: "canceled",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(sequenceDispatchModel.id, currentDispatch.id),
            eq(sequenceDispatchModel.workspaceId, workspaceId),
            eq(sequenceDispatchModel.status, "pending"),
          ),
        )

      canceled = [
        {
          id: currentDispatch.id,
          bucket: currentDispatch.bucket,
        },
      ]
    }

    const enrollment = await tx.query.contactsOnSequenceModel.findFirst({
      where: {
        id: enrollmentId,
        workspaceId,
      },
      columns: {
        sequenceId: true,
        contactId: true,
      },
    })

    if (!enrollment) {
      throw new Error("Enrollment not found")
    }

    const created = await createDispatch({
      workspaceId,
      sequenceId: enrollment.sequenceId,
      contactId: enrollment.contactId,
      stepId: newStepId,
      enrollmentId,
      runAt: newNextRunAt,
      client: tx,
    })
    return { canceled, created }
  }

  if ("transaction" in client) {
    return await client.transaction(executeReschedule)
  }
  return await executeReschedule(client)
}
export interface PauseEnrollmentParams {
  client?: DrizzleClient
  enrollmentId: string
  workspaceId: string
}
export async function pauseEnrollment(
  params: PauseEnrollmentParams,
): Promise<Array<{ id: string; bucket: number }>> {
  const { enrollmentId, workspaceId, client = db } = params

  const executePause = async (tx: DrizzleClient) => {
    await tx
      .update(contactsOnSequenceModel)
      .set({
        status: "paused",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contactsOnSequenceModel.id, enrollmentId),
          eq(contactsOnSequenceModel.workspaceId, workspaceId),
        ),
      )
    return await cancelPendingDispatches({
      enrollmentId,
      workspaceId,
      reason: "paused",
      client: tx,
    })
  }

  if ("transaction" in client) {
    return await client.transaction(executePause)
  }
  return await executePause(client)
}
export interface ResumeEnrollmentParams {
  client?: DrizzleClient
  enrollmentId: string
  nextRunAt: Date
  nextStepId: string
  workspaceId: string
}
export async function resumeEnrollment(
  params: ResumeEnrollmentParams,
): Promise<{ id: string; bucket: number; runAtMs: number }> {
  const {
    enrollmentId,
    workspaceId,
    nextRunAt,
    nextStepId,
    client = db,
  } = params

  const executeResume = async (tx: DrizzleClient) => {
    await tx
      .update(contactsOnSequenceModel)
      .set({
        status: "active",
        nextRunAt,
        nextStepId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contactsOnSequenceModel.id, enrollmentId),
          eq(contactsOnSequenceModel.workspaceId, workspaceId),
        ),
      )

    const enrollment = await tx.query.contactsOnSequenceModel.findFirst({
      where: {
        id: enrollmentId,
        workspaceId,
      },
      columns: {
        sequenceId: true,
        contactId: true,
      },
    })

    if (!enrollment) {
      throw new Error("Enrollment not found")
    }

    const result = await createDispatch({
      workspaceId,
      sequenceId: enrollment.sequenceId,
      contactId: enrollment.contactId,
      stepId: nextStepId,
      enrollmentId,
      runAt: nextRunAt,
      client: tx,
    })
    return result
  }

  if ("transaction" in client) {
    return await client.transaction(executeResume)
  }
  return await executeResume(client)
}
