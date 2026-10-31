import {
  and,
  type DatabaseClient,
  desc,
  eq,
  inArray,
  lt,
  ne,
  or,
  sql,
} from "../../client"
import {
  stagedCleanupOwed,
  templateInstallationModel,
  templateInstallationSyncModel,
} from "../../schema"
import type { TemplateInstallationModel } from "../../types"

/** Only the current owner of the lease may write; zero rows means it was fenced out. */
export const ownedByClaim = (input: { id: string; claimToken: string }) =>
  and(
    eq(templateInstallationModel.id, input.id),
    eq(templateInstallationModel.status, "installing"),
    eq(templateInstallationModel.claimToken, input.claimToken),
  )

/** `pending` for too long (never enqueued, or the job was lost) or `installing` past its lease. */
export const unfinishedInstallation = (input: {
  pendingBefore: Date
  leaseExpiredBefore: Date
}) =>
  or(
    and(
      eq(templateInstallationModel.status, "pending"),
      lt(templateInstallationModel.createdAt, input.pendingBefore),
    ),
    and(
      eq(templateInstallationModel.status, "installing"),
      lt(templateInstallationModel.claimedAt, input.leaseExpiredBefore),
    ),
  )

/**
 * Staged-object generations still to delete. The current generation is owed
 * only once the install failed (and its lease window has passed); an older one
 * is owed as soon as a retry moved on, since nothing writes it again.
 */
export const stagedCleanupDue = (input: { completedBefore: Date }) =>
  and(
    // The partial index's own predicate, verbatim, so the sweep scans it.
    stagedCleanupOwed(templateInstallationModel),
    or(
      ne(templateInstallationModel.status, "failed"),
      lt(templateInstallationModel.completedAt, input.completedBefore),
    ),
  )

/** A sync of this installation is queued or running. */
export const hasActiveSync = () =>
  sql<boolean>`EXISTS (SELECT 1 FROM ${templateInstallationSyncModel} WHERE ${templateInstallationSyncModel.installationId} = ${templateInstallationModel.id} AND ${templateInstallationSyncModel.status} IN ('pending', 'running'))`

export const findNewestBySourceTemplate = async (
  input: { workspaceId: string; sourceTemplateId: string },
  statuses: TemplateInstallationModel["status"][],
  tx: DatabaseClient,
): Promise<TemplateInstallationModel | null> => {
  const [row] = await tx
    .select()
    .from(templateInstallationModel)
    .where(
      and(
        eq(templateInstallationModel.workspaceId, input.workspaceId),
        eq(templateInstallationModel.sourceTemplateId, input.sourceTemplateId),
        inArray(templateInstallationModel.status, statuses),
      ),
    )
    .orderBy(desc(templateInstallationModel.id))
    .limit(1)
  return row ?? null
}
