import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  type Transaction,
} from "@chatbotx.io/database/client"
import { sequenceDispatchModel } from "@chatbotx.io/database/schema"
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
  contactInboxId: string
  enrollmentId: string
  runAt: Date
  sequenceId: string
  stepId: string
  workspaceId: string
}
export async function createDispatch(
  params: CreateDispatchParams,
): Promise<{ id: string; bucket: number; runAtMs: string }> {
  const {
    workspaceId,
    sequenceId,
    contactId,
    contactInboxId,
    stepId,
    enrollmentId,
    runAt,
    client = db,
  } = params
  const bucket = calculateBucket(workspaceId, contactId)
  const runAtMs = String(runAt.getTime())
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
      contactInboxId,
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
  const { enrollmentId, workspaceId, client = db } = params

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
