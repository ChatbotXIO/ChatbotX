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

/**
 * Cancellation lives apart from `dispatch-manager` on purpose. Creating a
 * dispatch needs `calculateBucket`, which hashes with Node's `crypto`; cancelling
 * one never does. Keeping them in one module meant every consumer of the cancel
 * path — including `@chatbotx.io/business`, which the builder loads into the Edge
 * Runtime — dragged `crypto` along and failed to compile. Import this module (or
 * the `@chatbotx.io/sequence-scheduler/dispatch-cancel` subpath) from anywhere
 * that must stay Edge-safe.
 */

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
