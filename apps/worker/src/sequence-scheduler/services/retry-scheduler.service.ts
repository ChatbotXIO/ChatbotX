import { and, db, eq } from "@aha.chat/database/client"
import {
  sequenceDispatchModel,
  sequenceEventModel,
} from "@aha.chat/database/schema"
import type { SchedulerClient } from "@aha.chat/scheduler"
import { createId } from "@paralleldrive/cuid2"
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
          eq(sequenceDispatchModel.chatbotId, dispatch.chatbotId),
        ),
      )

    await scheduler.addToRetry(dispatch.bucket, dispatch.id, retryAtMs)

    await this.recordRetryEvent(
      dispatch,
      nextAttempt,
      retryAtMs,
      retryDelayMs,
      error,
    )
  }

  async markDispatchFailed(
    dispatchId: string,
    chatbotId: string,
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
          eq(sequenceDispatchModel.chatbotId, chatbotId),
        ),
      )

    logger.error({ dispatchId, errorMessage }, "Dispatch marked as failed")
  }

  async markDispatchCanceled(
    dispatchId: string,
    chatbotId: string,
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
          eq(sequenceDispatchModel.chatbotId, chatbotId),
        ),
      )
  }

  private async recordRetryEvent(
    dispatch: DispatchWithRelations,
    nextAttempt: number,
    retryAtMs: number,
    retryDelayMs: number,
    error: unknown,
  ): Promise<void> {
    await db.insert(sequenceEventModel).values({
      id: createId(),
      chatbotId: dispatch.chatbotId,
      sequenceId: dispatch.sequenceId,
      contactId: dispatch.contactId,
      stepId: dispatch.stepId,
      dispatchId: dispatch.id,
      eventType: "dispatch_retry_scheduled",
      payload: {
        attempt: dispatch.attempt,
        nextAttempt,
        retryAtMs,
        retryDelayMs,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      occurredAt: new Date(),
    })
  }
}
