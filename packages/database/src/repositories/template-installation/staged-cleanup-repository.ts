import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  isNull,
  lt,
  or,
} from "../../client"
import { templateInstallationModel } from "../../schema"
import { stagedCleanupDue } from "./shared"

/** Staged-object cleanup claims and generations. */
export const templateInstallationStagedCleanupRepository = {
  /**
   * Installations with staged-object generations still to delete: a failed
   * install whose lease window has long passed (no worker can still be
   * writing its generation), or a retried one whose earlier generations are
   * never written again. Rows whose cleanup lease is live are skipped.
   */
  async listWithStagedObjectsToClean(
    input: { completedBefore: Date; leaseExpiredBefore: Date; limit: number },
    tx: DatabaseClient = db,
  ): Promise<{ id: string; workspaceId: string }[]> {
    return await tx
      .select({
        id: templateInstallationModel.id,
        workspaceId: templateInstallationModel.workspaceId,
      })
      .from(templateInstallationModel)
      .where(
        and(
          stagedCleanupDue(input),
          or(
            isNull(templateInstallationModel.stagedCleanupClaimedAt),
            lt(
              templateInstallationModel.stagedCleanupClaimedAt,
              input.leaseExpiredBefore,
            ),
          ),
        ),
      )
      .orderBy(asc(templateInstallationModel.updatedAt))
      .limit(input.limit)
  },

  /**
   * Takes the cleanup lease and returns the generations to delete
   * (`from`..`to`, inclusive), or null when nothing is due or another worker
   * holds a live lease. A failed install owes its current generation too; any
   * other status owes only the generations a retry has left behind.
   */
  async claimStagedObjectsCleanup(
    input: { id: string; completedBefore: Date; leaseExpiredBefore: Date },
    tx: DatabaseClient = db,
  ): Promise<{
    workspaceId: string
    from: number
    to: number
  } | null> {
    const [row] = await tx
      .update(templateInstallationModel)
      .set({ stagedCleanupClaimedAt: new Date() })
      .where(
        and(
          eq(templateInstallationModel.id, input.id),
          stagedCleanupDue(input),
          or(
            isNull(templateInstallationModel.stagedCleanupClaimedAt),
            lt(
              templateInstallationModel.stagedCleanupClaimedAt,
              input.leaseExpiredBefore,
            ),
          ),
        ),
      )
      .returning({
        workspaceId: templateInstallationModel.workspaceId,
        status: templateInstallationModel.status,
        stagingGeneration: templateInstallationModel.stagingGeneration,
        stagedCleanedGeneration:
          templateInstallationModel.stagedCleanedGeneration,
      })
    if (!row) {
      return null
    }
    return {
      workspaceId: row.workspaceId,
      from: row.stagedCleanedGeneration + 1,
      to:
        row.status === "failed"
          ? row.stagingGeneration
          : row.stagingGeneration - 1,
    }
  },

  /**
   * Records that every generation up to `to` is deleted. Fenced by the value
   * it read (`from - 1`), so a concurrent cleanup never moves it backwards.
   */
  async advanceStagedCleanedGeneration(
    input: { id: string; from: number; to: number },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(templateInstallationModel)
      .set({ stagedCleanedGeneration: input.to })
      .where(
        and(
          eq(templateInstallationModel.id, input.id),
          eq(templateInstallationModel.stagedCleanedGeneration, input.from - 1),
        ),
      )
  },

  /** Gives the cleanup lease back so the sweep can retry a partial delete at once. */
  async releaseStagedObjectsCleanup(
    id: string,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(templateInstallationModel)
      .set({ stagedCleanupClaimedAt: null })
      .where(eq(templateInstallationModel.id, id))
  },
}
