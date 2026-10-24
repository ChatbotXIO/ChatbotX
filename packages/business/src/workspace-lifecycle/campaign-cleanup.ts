import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  sql,
} from "@chatbotx.io/database/client"
import { broadcastStatuses } from "@chatbotx.io/database/partials"
import { broadcastModel } from "@chatbotx.io/database/schema"
import { disarmAllSeriesForWorkspace } from "../broadcast/recurrence-ledger"

export async function cancelInFlightBroadcastsForWorkspace(props: {
  tx?: DatabaseClient
  workspaceId: string
}): Promise<number> {
  const { tx, workspaceId } = props
  if (!tx) {
    return await db.transaction(async (own) =>
      cancelInFlightBroadcastsForWorkspace({ tx: own, workspaceId }),
    )
  }

  // Repeating series first (lock order: series rows, then broadcast rows), so
  // a run being created concurrently cannot slip past the cancellation.
  await disarmAllSeriesForWorkspace(tx, { workspaceId })

  const cancelledBroadcasts = await tx
    .update(broadcastModel)
    .set({
      status: broadcastStatuses.enum.cancelled,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(broadcastModel.workspaceId, workspaceId),
        inArray(broadcastModel.status, [
          broadcastStatuses.enum.scheduled,
          broadcastStatuses.enum.sending,
          broadcastStatuses.enum.recurring,
        ]),
      ),
    )
    .returning({ id: broadcastModel.id })

  return cancelledBroadcasts.length
}

export const SEQUENCE_ENROLLMENT_CANCEL_BATCH_SIZE = 500
export const MAX_SEQUENCE_ENROLLMENT_CANCEL_BATCHES = 400

export async function completeActiveSequenceEnrollmentsForWorkspace(props: {
  tx?: DatabaseClient
  workspaceId: string
}): Promise<number> {
  const client = props.tx ?? db
  const maxBatches = props.tx ? 1 : MAX_SEQUENCE_ENROLLMENT_CANCEL_BATCHES
  let completed = 0

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const rows = await client.execute<{ id: string }>(sql`
      UPDATE "ContactOnSequence"
      SET
        "status" = 'completed',
        "completedAt" = NOW(),
        "nextRunAt" = NULL,
        "nextStepId" = NULL,
        "updatedAt" = NOW()
      WHERE "id" IN (
        SELECT "id"
        FROM "ContactOnSequence"
        WHERE "workspaceId" = ${props.workspaceId}
          AND "status" = 'active'
        LIMIT ${SEQUENCE_ENROLLMENT_CANCEL_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id"
    `)
    const count = rows.rowCount ?? 0
    completed += count
    if (count < SEQUENCE_ENROLLMENT_CANCEL_BATCH_SIZE) {
      break
    }
  }

  return completed
}
