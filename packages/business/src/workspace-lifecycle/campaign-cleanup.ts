import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import { broadcastStatuses } from "@chatbotx.io/database/partials"
import {
  broadcastModel,
  contactsOnSequenceModel,
} from "@chatbotx.io/database/schema"
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

export async function completeActiveSequenceEnrollmentsForWorkspace(props: {
  tx?: DatabaseClient
  workspaceId: string
}): Promise<number> {
  const { tx = db, workspaceId } = props

  const completedEnrollments = await tx
    .update(contactsOnSequenceModel)
    .set({
      status: "completed",
      completedAt: new Date(),
      nextRunAt: null,
      nextStepId: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contactsOnSequenceModel.workspaceId, workspaceId),
        eq(contactsOnSequenceModel.status, "active"),
      ),
    )
    .returning({ id: contactsOnSequenceModel.id })

  return completedEnrollments.length
}
