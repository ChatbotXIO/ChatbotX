import { sequenceDispatchRepository } from "@chatbotx.io/database/repositories"
import { logger } from "../../lib/logger"
import type { DispatchWithRelations } from "./types"

export class DispatchProcessorService {
  async fetchDispatch(
    dispatchId: string,
    expectedStatus: string,
    workspaceId: string,
  ) {
    try {
      return await sequenceDispatchRepository.findWithRelations({
        id: dispatchId,
        status: expectedStatus,
        workspaceId,
      })
    } catch (error) {
      logger.error(error, "Error fetchDispatch query failed")
      return null
    }
  }

  validateDispatch(
    dispatch: Awaited<ReturnType<typeof this.fetchDispatch>>,
  ): dispatch is DispatchWithRelations {
    if (dispatch?.status !== "pending") {
      return false
    }

    return true
  }

  isDispatchReady(dispatch: DispatchWithRelations): boolean {
    const nowMs = Date.now()
    const runAt = Number(dispatch.runAtMs)

    return runAt <= nowMs + 1000
  }

  async lockDispatch(dispatch: DispatchWithRelations): Promise<boolean> {
    return await sequenceDispatchRepository.claim({
      id: dispatch.id,
      workspaceId: dispatch.workspaceId,
      lockOwner: process.env.HOSTNAME || "unknown",
    })
  }
}
