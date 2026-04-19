import { and, db, eq } from "@chatbotx.io/database/client"
import { sequenceDispatchModel } from "@chatbotx.io/database/schema"
import { logger } from "../../lib/logger"

export class RetrySchedulerService {
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
