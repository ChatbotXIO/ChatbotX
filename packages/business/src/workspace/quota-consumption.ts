import { logger } from "../logger"
import { quotaEnforcementService } from "../quota-enforcement/service"
import { workspaceUsageService } from "../workspace-usage/service"

/**
 * Tracks the `workspaces` seat `workspaceService.create` consumed for a
 * caller that owns the surrounding transaction. The seat is taken in Redis +
 * the owner's `UserQuota` row, outside any SQL transaction, so a later
 * rollback of the caller's `tx` cannot hand it back on its own — the caller
 * passes this tracker in and calls `compensateWorkspaceQuotaConsumption`
 * from its own catch. Mirrors `ConnectionQuotaConsumption`.
 */
export type WorkspaceQuotaConsumption =
  | {
      consumed: false
      userId?: undefined
      workspaceId?: undefined
      teamMembersLiveIncremented?: undefined
    }
  | {
      consumed: true
      userId: string
      workspaceId: string
      /** Whether Redis took the owner-member `teamMembers` +1 (see `rollbackLiveIncrement`). */
      teamMembersLiveIncremented: boolean
    }

/**
 * Best-effort release of one `workspaces` seat. Used alone when the
 * Workspace row itself was never written (nothing else moved), and by
 * `compensateWorkspaceQuotaConsumption` otherwise.
 */
export async function releaseWorkspaceSeat(userId: string): Promise<void> {
  try {
    await quotaEnforcementService.release({ userId, metric: "workspaces" })
  } catch (err) {
    logger.error(
      { err, userId },
      "workspace create rollback: workspace seat release failed",
    )
  }
}

/**
 * Hands back what a `WorkspaceQuotaConsumption` tracked after the
 * transaction that created the workspace rolled back: the owner's
 * `workspaces` seat, plus the live `teamMembers` counter when the owner-member
 * insert actually bumped it (its durable `WorkspaceUsage` row went with the
 * transaction, so only the Redis half is left). Idempotent: the
 * tracker is reset on the first call, so a second call is a no-op.
 * Best-effort — failures are logged, never thrown, since the caller is
 * already propagating the original error.
 */
export async function compensateWorkspaceQuotaConsumption(
  quotaConsumption: WorkspaceQuotaConsumption,
): Promise<void> {
  if (!quotaConsumption.consumed) {
    return
  }
  const { userId, workspaceId, teamMembersLiveIncremented } = quotaConsumption
  Object.assign(quotaConsumption, {
    consumed: false,
    userId: undefined,
    workspaceId: undefined,
    teamMembersLiveIncremented: undefined,
  })
  await releaseWorkspaceSeat(userId)
  if (!teamMembersLiveIncremented) {
    return
  }
  try {
    await workspaceUsageService.rollbackLiveIncrement(
      workspaceId,
      "teamMembers",
    )
  } catch (err) {
    logger.warn(
      { err, userId, workspaceId },
      "workspace create rollback: live team-member counter rollback failed",
    )
  }
}
