import { isCloud } from "../keys"
import { logger } from "../logger"
import { userQuotaService } from "../user-quota/service"
import { workspaceService } from "../workspace/service"
import { resolveWorkspaceFreezeReason } from "./predicates"

/**
 * No-op workspace work for frozen workspaces (owner entitlement expired,
 * deletion scheduled, or the workspace row already purged).
 *
 * Jobs without a workspace identity remain fail-open because they cannot be
 * safely attributed to a tenant here. Once an id IS present the guard is
 * fail-CLOSED: a vanished workspace row means the purge cron already ran, so
 * leftover delayed jobs (smart-delay resumes, wait/follow-up wake-ups) must not
 * execute against a tenant that no longer exists.
 */
export async function withBlockedOwnerGuard<T>(
  workspaceId: string | undefined,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  if (!workspaceId) {
    return await fn()
  }

  const workspace = await workspaceService.find({ where: { id: workspaceId } })

  // Resolved in two passes on purpose. The Workspace row ALONE decides
  // `missingWorkspace` and `scheduledForDeletion`, so those verdicts never
  // depend on — and can never be broken by — an owner quota read. Only
  // `ownerBlocked` needs entitlements, and only the cloud edition can produce
  // it, so self-hosted installs skip the lookup entirely.
  const rowReason = resolveWorkspaceFreezeReason({ workspace })
  const ownerReason =
    rowReason || !isCloud() || !workspace
      ? null
      : resolveWorkspaceFreezeReason({
          accessState: await userQuotaService.getAccessState(workspace.ownerId),
          workspace,
        })
  const freezeReason = rowReason ?? ownerReason

  if (freezeReason) {
    logger.info(
      {
        freezeReason,
        ownerId: workspace?.ownerId,
        workspaceId,
      },
      "Skipping workspace job for frozen workspace",
    )
    return
  }

  return await fn()
}
