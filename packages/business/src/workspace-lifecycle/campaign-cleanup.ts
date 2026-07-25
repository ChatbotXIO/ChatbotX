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

export async function cancelInFlightBroadcastsForWorkspace(props: {
  tx?: DatabaseClient
  workspaceId: string
}): Promise<number> {
  const { tx = db, workspaceId } = props

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
