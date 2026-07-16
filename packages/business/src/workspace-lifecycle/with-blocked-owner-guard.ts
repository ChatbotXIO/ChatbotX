import { logger } from "../logger"
import { userQuotaService } from "../user-quota/service"
import { workspaceService } from "../workspace/service"

/**
 * No-op workspace work for owners whose cloud entitlement has expired.
 * Jobs without a workspace identity remain fail-open because they cannot be
 * safely attributed to a tenant here.
 */
export async function withBlockedOwnerGuard<T>(
  workspaceId: string | undefined,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  if (!workspaceId) {
    return await fn()
  }

  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  if (!workspace) {
    return await fn()
  }
  const accessState = await userQuotaService.getAccessState(workspace.ownerId)

  if (accessState.blocked) {
    logger.info(
      { workspaceId, ownerId: workspace.ownerId },
      "Skipping workspace job for blocked owner",
    )
    return
  }

  return await fn()
}
