import {
  and,
  type DatabaseClient,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import { sequenceEventTypes } from "@chatbotx.io/database/partials"
import {
  sequenceDispatchModel,
  sequenceEventModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"

export const sequenceDispatchUtils = {
  bulkCancelPendingDispatches: async (props: {
    dbClient: DatabaseClient
    workspaceId: string
    enrollmentId: string
    reason?: "canceled"
  }) => {
    const { dbClient, workspaceId, enrollmentId, reason } = props

    // Find all pending dispatches for the enrollment
    const pendingDispatches =
      await dbClient.query.sequenceDispatchModel.findMany({
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
    const updatedDispatches = await dbClient
      .update(sequenceDispatchModel)
      .set({
        status: "canceled",
      })
      .where(
        and(
          inArray(sequenceDispatchModel.id, dispatchIds),
          eq(sequenceDispatchModel.status, "pending"),
        ),
      )
      .returning()

    if (updatedDispatches.length === 0) {
      return []
    }

    // Create a sequence event for each pending dispatch
    await dbClient.insert(sequenceEventModel).values(
      pendingDispatches.map((d) => ({
        id: createId(),
        workspaceId,
        sequenceId: d.sequenceId,
        contactId: d.contactId,
        stepId: d.stepId,
        dispatchId: d.id,
        eventType: sequenceEventTypes.enum.dispatch_canceled,
        payload: { reason },
        occurredAt: new Date(),
      })),
    )

    return pendingDispatches.map((d) => ({
      id: d.id,
      bucket: d.bucket,
    }))
  },
}

export type SequenceDispatchUtils = typeof sequenceDispatchUtils
