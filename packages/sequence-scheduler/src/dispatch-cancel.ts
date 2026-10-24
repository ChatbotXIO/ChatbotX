import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  sql,
  type Transaction,
} from "@chatbotx.io/database/client"
import { sequenceDispatchModel } from "@chatbotx.io/database/schema"
import { sequenceConnections } from "@chatbotx.io/redis"
import { SchedulerClient } from "@chatbotx.io/scheduler"

/**
 * Cancellation lives apart from `dispatch-manager` by responsibility: creating a
 * dispatch assigns a bucket and inserts a row, cancelling one only reads rows
 * back and clears their schedule entries. Both modules are Edge-safe now that
 * `dispatch-manager` bucketing no longer imports Node's `crypto`.
 */

type DrizzleClient = typeof db | Transaction
export type ScheduledDispatch = { id: string; bucket: number }
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
export const WORKSPACE_DISPATCH_CANCEL_BATCH_SIZE = 500
export const MAX_WORKSPACE_DISPATCH_CANCEL_BATCHES = 400

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

export async function cancelPendingDispatchBatch(params: {
  client?: DatabaseClient
  workspaceId: string
}): Promise<ScheduledDispatch[]> {
  const result = await (params.client ?? db).execute<ScheduledDispatch>(sql`
    UPDATE "SequenceDispatch"
    SET "status" = 'canceled', "updatedAt" = NOW()
    WHERE ("id", "workspaceId") IN (
      SELECT "id", "workspaceId"
      FROM "SequenceDispatch"
      WHERE "workspaceId" = ${params.workspaceId}
        AND "status" = 'pending'
      LIMIT ${WORKSPACE_DISPATCH_CANCEL_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "bucket"
  `)
  return result.rows
}

export async function cancelPendingDispatchesForWorkspace(params: {
  client?: DatabaseClient
  onCanceled?: (dispatches: ScheduledDispatch[]) => Promise<void>
  workspaceId: string
}): Promise<number> {
  const maxBatches = params.client ? 1 : MAX_WORKSPACE_DISPATCH_CANCEL_BATCHES
  let canceled = 0

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const dispatches = await cancelPendingDispatchBatch(params)
    canceled += dispatches.length
    if (dispatches.length === 0) {
      break
    }

    await params.onCanceled?.(dispatches)
    if (dispatches.length < WORKSPACE_DISPATCH_CANCEL_BATCH_SIZE) {
      break
    }
  }

  return canceled
}

export async function removeDispatchesFromSchedule(
  dispatches: ScheduledDispatch[],
): Promise<void> {
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
