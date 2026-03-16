import {
  and,
  db,
  eq,
  inArray,
  type Transaction,
} from "@aha.chat/database/client"
import {
  contactsOnSequenceModel,
  sequenceDispatchModel,
  sequenceEventModel,
} from "@aha.chat/database/schema"
import { getDragonflyClient } from "@aha.chat/scheduler"
import { createId } from "@paralleldrive/cuid2"
import { createHash } from "crypto"

type DrizzleClient = typeof db | Transaction

export function calculateBucket(chatbotId: string, contactId: string): number {
  const key = `${chatbotId}:${contactId}`
  const hash = createHash("sha256").update(key).digest()
  return hash[0] // First byte gives 0-255
}
export function generateIdempotencyKey(
  chatbotId: string,
  enrollmentId: string,
  stepId: string,
  runAt: Date,
): string {
  return `${chatbotId}:${enrollmentId}:${stepId}:${runAt.toISOString()}`
}
export interface CreateDispatchParams {
  chatbotId: string
  client?: DrizzleClient
  contactId: string
  enrollmentId: string
  runAt: Date
  sequenceId: string
  stepId: string
}
export async function createDispatch(
  params: CreateDispatchParams,
): Promise<{ id: string; bucket: number; runAtMs: number }> {
  const {
    chatbotId,
    sequenceId,
    contactId,
    stepId,
    enrollmentId,
    runAt,
    client = db,
  } = params
  const bucket = calculateBucket(chatbotId, contactId)
  const runAtMs = runAt.getTime()
  const idempotencyKey = generateIdempotencyKey(
    chatbotId,
    enrollmentId,
    stepId,
    runAt,
  )
  const [dispatch] = await client
    .insert(sequenceDispatchModel)
    .values({
      id: createId(),
      chatbotId,
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
  chatbotId: string
  client?: DrizzleClient
  enrollmentId: string
  reason?: string
}
export async function cancelPendingDispatches(
  params: CancelPendingDispatchesParams,
): Promise<Array<{ id: string; bucket: number }>> {
  const { enrollmentId, chatbotId, reason = "canceled", client = db } = params

  const pendingDispatches = await client.query.sequenceDispatchModel.findMany({
    where: {
      enrollmentId,
      chatbotId,
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
        eq(sequenceDispatchModel.chatbotId, chatbotId),
        eq(sequenceDispatchModel.status, "pending"),
      ),
    )

  await client.insert(sequenceEventModel).values(
    pendingDispatches.map((d) => ({
      id: createId(),
      chatbotId,
      sequenceId: d.sequenceId,
      contactId: d.contactId,
      stepId: d.stepId,
      dispatchId: d.id,
      eventType: "dispatch_canceled" as const,
      payload: { reason },
      occurredAt: new Date(),
    })),
  )

  const dragonfly = getDragonflyClient()
  for (const dispatch of pendingDispatches) {
    await dragonfly.removeFromSchedule(dispatch.bucket, dispatch.id)
  }

  return pendingDispatches.map((d) => ({
    id: d.id,
    bucket: d.bucket,
  }))
}
export interface RescheduleEnrollmentParams {
  chatbotId: string
  client?: DrizzleClient
  enrollmentId: string
  newNextRunAt: Date
  newStepId: string
}
export async function rescheduleEnrollment(
  params: RescheduleEnrollmentParams,
): Promise<{
  canceled: Array<{ id: string; bucket: number }> | null
  created: { id: string; bucket: number; runAtMs: number } | null
}> {
  const {
    enrollmentId,
    chatbotId,
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
          eq(contactsOnSequenceModel.chatbotId, chatbotId),
        ),
      )

    const currentDispatch = await tx.query.sequenceDispatchModel.findFirst({
      where: {
        enrollmentId,
        chatbotId,
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
            eq(sequenceDispatchModel.chatbotId, chatbotId),
            eq(sequenceDispatchModel.status, "pending"),
          ),
        )

      await tx.insert(sequenceEventModel).values({
        id: createId(),
        chatbotId,
        sequenceId: currentDispatch.sequenceId,
        contactId: currentDispatch.contactId,
        stepId: currentDispatch.stepId,
        dispatchId: currentDispatch.id,
        eventType: "dispatch_canceled" as const,
        payload: { reason: "reschedule" },
        occurredAt: new Date(),
      })

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
        chatbotId,
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
      chatbotId,
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
  chatbotId: string
  client?: DrizzleClient
  enrollmentId: string
}
export async function pauseEnrollment(
  params: PauseEnrollmentParams,
): Promise<Array<{ id: string; bucket: number }>> {
  const { enrollmentId, chatbotId, client = db } = params

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
          eq(contactsOnSequenceModel.chatbotId, chatbotId),
        ),
      )
    return await cancelPendingDispatches({
      enrollmentId,
      chatbotId,
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
  chatbotId: string
  client?: DrizzleClient
  enrollmentId: string
  nextRunAt: Date
  nextStepId: string
}
export async function resumeEnrollment(
  params: ResumeEnrollmentParams,
): Promise<{ id: string; bucket: number; runAtMs: number }> {
  const { enrollmentId, chatbotId, nextRunAt, nextStepId, client = db } = params

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
          eq(contactsOnSequenceModel.chatbotId, chatbotId),
        ),
      )

    const enrollment = await tx.query.contactsOnSequenceModel.findFirst({
      where: {
        id: enrollmentId,
        chatbotId,
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
      chatbotId,
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
