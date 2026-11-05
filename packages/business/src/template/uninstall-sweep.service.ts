import { db } from "@chatbotx.io/database/client"
import { templateUninstallStateRepository } from "@chatbotx.io/database/repositories"
import { UNINSTALL_ABANDON_AFTER_MS } from "./template-leases"

/** What the periodic sweep re-dispatches: unfinished uninstalls and unflushed effects. */
export const templateUninstallSweepService = {
  /**
   * Uninstalls nobody finished within `UNINSTALL_ABANDON_AFTER_MS` (a worker
   * that keeps dying, jobs that never arrive) end `failed`, outcomes kept so a
   * new request resumes: the sweep stops re-dispatching them, and the
   * installation is requestable again. Returns how many were closed.
   */
  async abandonStale(limit: number): Promise<number> {
    const requestedBefore = new Date(Date.now() - UNINSTALL_ABANDON_AFTER_MS)
    const stale = await templateUninstallStateRepository.listAbandoned({
      requestedBefore,
      limit,
    })
    let closed = 0
    for (const { id } of stale) {
      const moved = await db.transaction(async (tx) => {
        const counts = await templateUninstallStateRepository.countOutcomes(
          id,
          tx,
        )
        const operationId =
          await templateUninstallStateRepository.operationIdOf(id, tx)
        const fenced = await templateUninstallStateRepository.markAbandoned(
          {
            id,
            requestedBefore,
            counts,
            errorCode: "templateUninstallAbandoned",
          },
          tx,
        )
        if (fenced && operationId) {
          await templateUninstallStateRepository.finalizeOperationIfComplete(
            operationId,
            tx,
          )
        }
        return fenced
      })
      closed += moved ? 1 : 0
    }
    return closed
  },

  /** `pending`, or `running` past its lease. Blocked owners end `skipped`, so are never listed. */
  async listStale(
    limit: number,
  ): Promise<{ id: string; workspaceId: string; attempt: number }[]> {
    return await templateUninstallStateRepository.listStale(limit)
  },

  async listPendingEffects(
    limit: number,
  ): Promise<{ id: string; workspaceId: string }[]> {
    return await templateUninstallStateRepository.listInstallationsWithPendingEffects(
      limit,
    )
  },

  /**
   * Operations whose members are all final but that never got their snapshot
   * (the last two members finished together): finalized here, under the
   * operation row lock, so the notice is not lost.
   */
  async finalizeStuckOperations(limit: number): Promise<number> {
    const ids =
      await templateUninstallStateRepository.listOperationsToFinalize(limit)
    let finalized = 0
    for (const id of ids) {
      const done = await db.transaction(
        async (tx) =>
          await templateUninstallStateRepository.finalizeOperationIfComplete(
            id,
            tx,
          ),
      )
      finalized += done ? 1 : 0
    }
    return finalized
  },
}
