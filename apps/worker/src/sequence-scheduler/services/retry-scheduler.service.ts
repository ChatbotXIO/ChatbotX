import { and, db, eq } from "@chatbotx.io/database/client"
import { sequenceDispatchModel } from "@chatbotx.io/database/schema"
import type { SchedulerClient } from "@chatbotx.io/scheduler"
import { logger } from "../../lib/logger"
import { RETRY_BASE_DELAY_MS } from "./constants"
import type { DispatchWithRelations } from "./types"

export class RetrySchedulerService {
  calculateRetryDelay(attempt: number): number {
    return RETRY_BASE_DELAY_MS * 2 ** attempt
  }

  async scheduleRetry(
    dispatch: DispatchWithRelations,
    error: unknown,
    scheduler: SchedulerClient,
  ): Promise<void> {
    const nextAttempt = dispatch.attempt + 1
    const retryDelayMs = this.calculateRetryDelay(dispatch.attempt)
    const retryAtMs = Date.now() + retryDelayMs

    await db
      .update(sequenceDispatchModel)
      .set({
        status: "pending",
        attempt: nextAttempt,
        lastError: error instanceof Error ? error.message : "Unknown error",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sequenceDispatchModel.id, dispatch.id),
          eq(sequenceDispatchModel.workspaceId, dispatch.workspaceId),
        ),
      )

    await scheduler.addToRetry(dispatch.bucket, dispatch.id, retryAtMs)
  }

  async markDispatchFailed(
    dispatchId: string,
    workspaceId: string,
    errorMessage: string,
  ): Promise<void> {
    await db
      .update(sequenceDispatchModel)
      .set({
        status: "failed",
        lastError: errorMessage,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sequenceDispatchModel.id, dispatchId),
          eq(sequenceDispatchModel.workspaceId, workspaceId),
        ),
      )

    logger.error({ dispatchId, errorMessage }, "Dispatch marked as failed")
  }

  async markDispatchCanceled(
    dispatchId: string,
    workspaceId: string,
    _reason: string,
  ): Promise<void> {
    await db
      .update(sequenceDispatchModel)
      .set({
        status: "canceled",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sequenceDispatchModel.id, dispatchId),
          eq(sequenceDispatchModel.workspaceId, workspaceId),
        ),
      )
  }
}
