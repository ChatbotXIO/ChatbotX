import {
  and,
  type DatabaseClient,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import { sequenceDispatchModel } from "@chatbotx.io/database/schema"

export const sequenceDispatchUtils = {
  bulkCancelPendingDispatches: async (props: {
    dbClient: DatabaseClient
    workspaceId: string
    enrollmentId: string
    reason?: "canceled"
  }) => {
    const { dbClient, workspaceId, enrollmentId } = props

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
          eq(sequenceDispatchModel.workspaceId, workspaceId),
          eq(sequenceDispatchModel.status, "pending"),
        ),
      )
      .returning()

    if (updatedDispatches.length === 0) {
      return []
    }

    return pendingDispatches.map((d) => ({
      id: d.id,
      bucket: d.bucket,
    }))
  },

  /** Load a running dispatch — moved verbatim from `sequence-flow.ts` `fetchDispatch`. */
  findRunning: async (props: {
    dbClient: DatabaseClient
    dispatchId: string
    workspaceId: string
  }) => {
    const { dbClient, dispatchId, workspaceId } = props
    return await dbClient.query.sequenceDispatchModel.findFirst({
      where: {
        id: dispatchId,
        workspaceId,
        status: "running",
      },
    })
  },

  /**
   * Mark a dispatch completed — moved verbatim from `sequence-flow.ts`
   * `markDispatchCompleted`, keeping its `status = 'running'` guard
   * (idempotency guard for job retries).
   */
  markCompleted: async (props: {
    dbClient: DatabaseClient
    dispatchId: string
    workspaceId: string
    sentAt: Date
  }): Promise<void> => {
    const { dbClient, dispatchId, workspaceId, sentAt } = props
    await dbClient
      .update(sequenceDispatchModel)
      .set({
        status: "completed",
        completedAt: sentAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sequenceDispatchModel.id, dispatchId),
          eq(sequenceDispatchModel.workspaceId, workspaceId),
          eq(sequenceDispatchModel.status, "running"),
        ),
      )
  },

  /**
   * Mark a dispatch canceled — keeps the `status = 'running'` guard
   * (idempotency guard for job retries).
   */
  markCanceled: async (props: {
    dbClient: DatabaseClient
    dispatchId: string
    workspaceId: string
    reason: string
  }): Promise<void> => {
    const { dbClient, dispatchId, workspaceId, reason } = props
    await dbClient
      .update(sequenceDispatchModel)
      .set({
        status: "canceled",
        lastError: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sequenceDispatchModel.id, dispatchId),
          eq(sequenceDispatchModel.workspaceId, workspaceId),
          eq(sequenceDispatchModel.status, "running"),
        ),
      )
  },

  /**
   * Mark a dispatch failed — keeps the `status = 'running'` guard
   * (idempotency guard for job retries).
   */
  markFailed: async (props: {
    dbClient: DatabaseClient
    dispatchId: string
    workspaceId: string
    errorMessage: string
  }): Promise<void> => {
    const { dbClient, dispatchId, workspaceId, errorMessage } = props
    await dbClient
      .update(sequenceDispatchModel)
      .set({
        status: "failed",
        lastError: errorMessage,
        failedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sequenceDispatchModel.id, dispatchId),
          eq(sequenceDispatchModel.workspaceId, workspaceId),
          eq(sequenceDispatchModel.status, "running"),
        ),
      )
  },
}

export type SequenceDispatchUtils = typeof sequenceDispatchUtils
