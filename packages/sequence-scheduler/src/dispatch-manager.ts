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
type ScheduledDispatch = { id: string; bucket: number }
type PendingDispatch = {
  bucket: number
  contactId: string
  id: string
  sequenceId: string
  stepId: string
}

type PendingDispatchWhere = {
  enrollmentId?: string
  status: "pending"
  workspaceId: string
}

type CancelPendingDispatchesOptions = {
  client?: DrizzleClient
  removeFromSchedule?: boolean
  where: PendingDispatchWhere
}

const pendingDispatchColumns = {
  id: true,
  bucket: true,
  sequenceId: true,
  contactId: true,
  stepId: true,
} as const

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
    client,
  } = params
  const bucket = calculateBucket(workspaceId, contactId)
  const runAtMs = String(runAt.getTime())
  const dispatchId = createId()
  const idempotencyKey = generateIdempotencyKey(
    workspaceId,
    enrollmentId,
    stepId,
    runAt,
  )

  const insertDispatch = async (tx: DrizzleClient) => {
    const [dispatch] = await tx
      .insert(sequenceDispatchModel)
      .values({
        id: dispatchId,
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

  if (client) {
    return await insertDispatch(client)
  }

  return await insertDispatch(db)
}
export interface CancelPendingDispatchesParams {
  client?: DatabaseClient | Transaction
  enrollmentId: string
  reason?: string
  /**
   * Set to false only when the caller removes scheduler entries after its
   * surrounding database transaction has committed.
   */
  removeFromSchedule?: boolean
  workspaceId: string
}
async function cancelPendingDispatchesByWhere(
  options: CancelPendingDispatchesOptions,
): Promise<ScheduledDispatch[]> {
  const { client = db, removeFromSchedule = true, where } = options
  const pendingDispatches = (await client.query.sequenceDispatchModel.findMany({
    where,
    columns: pendingDispatchColumns,
  })) as PendingDispatch[]

  if (pendingDispatches.length === 0) {
    return []
  }

  const dispatchIds = pendingDispatches.map((dispatch) => dispatch.id)
  await client
    .update(sequenceDispatchModel)
    .set({
      status: "canceled",
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(sequenceDispatchModel.id, dispatchIds),
        eq(sequenceDispatchModel.workspaceId, where.workspaceId),
        eq(sequenceDispatchModel.status, "pending"),
      ),
    )

  if (removeFromSchedule) {
    await removeDispatchesFromSchedule(pendingDispatches)
  }

  return pendingDispatches.map((dispatch) => ({
    id: dispatch.id,
    bucket: dispatch.bucket,
  }))
}

export async function cancelPendingDispatches(
  params: CancelPendingDispatchesParams,
): Promise<ScheduledDispatch[]> {
  return await cancelPendingDispatchesByWhere({
    client: params.client,
    removeFromSchedule: params.removeFromSchedule,
    where: {
      enrollmentId: params.enrollmentId,
      status: "pending",
      workspaceId: params.workspaceId,
    },
  })
}

export async function cancelPendingDispatchesForWorkspace(params: {
  client?: DatabaseClient | Transaction
  removeFromSchedule?: boolean
  workspaceId: string
}): Promise<ScheduledDispatch[]> {
  return await cancelPendingDispatchesByWhere({
    client: params.client,
    removeFromSchedule: params.removeFromSchedule,
    where: {
      status: "pending",
      workspaceId: params.workspaceId,
    },
  })
}

export async function removeDispatchesFromSchedule(
  dispatches: ScheduledDispatch[],
) {
  if (dispatches.length === 0) {
    return
  }

  const redisClient = await sequenceConnections.useExisting()
  const scheduler = new SchedulerClient(redisClient)

  const results = await Promise.allSettled(
    dispatches.map((dispatch) =>
      scheduler.removeFromSchedule(dispatch.bucket, dispatch.id),
    ),
  )
  const failures = results.flatMap((result, index) => {
    if (result.status !== "rejected") {
      return []
    }

    const dispatch = dispatches[index]
    if (!dispatch) {
      return []
    }

    return [{ dispatch, reason: result.reason }]
  })

  if (failures.length > 0) {
    const failedDispatches = failures
      .map(({ dispatch }) => `${dispatch.id} bucket=${dispatch.bucket}`)
      .join(", ")

    throw new AggregateError(
      failures.map(({ dispatch, reason }) => {
        const reasonMessage =
          reason instanceof Error ? reason.message : String(reason)
        return new Error(
          `Failed to remove ${dispatch.id} bucket=${dispatch.bucket}: ${reasonMessage}`,
        )
      }),
      `Failed to remove sequence dispatches from schedule: ${failedDispatches}`,
    )
  }
}
