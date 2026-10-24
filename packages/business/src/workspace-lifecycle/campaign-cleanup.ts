import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import { broadcastStatuses } from "@chatbotx.io/database/partials"
import { sequenceRepository } from "@chatbotx.io/database/repositories/sequence"
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

export async function completeActiveSequenceEnrollmentBatch(props: {
  tx: DatabaseClient
  workspaceId: string
}): Promise<number> {
  return await sequenceRepository.completeActiveEnrollmentBatch(
    {
      limit: SEQUENCE_ENROLLMENT_CANCEL_BATCH_SIZE,
      workspaceId: props.workspaceId,
    },
    props.tx,
  )
}
