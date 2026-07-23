import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { logger } from "../logger"
import { type AccessState, userQuotaService } from "../user-quota/service"
import { workspaceService } from "../workspace/service"
import { isWorkspaceScheduledForDeletion } from "./predicates"

type WorkspaceFreezeReason = "ownerBlocked" | "scheduledForDeletion"

type WorkspaceFreezeContext = {
  accessState: AccessState
  workspace: WorkspaceModel
}

const FREEZE_CHECKS: ReadonlyArray<{
  isFrozen: (context: WorkspaceFreezeContext) => boolean
  reason: WorkspaceFreezeReason
}> = [
  {
    reason: "scheduledForDeletion",
    isFrozen: ({ workspace }) => isWorkspaceScheduledForDeletion(workspace),
  },
  {
    reason: "ownerBlocked",
    isFrozen: ({ accessState }) => accessState.blocked,
  },
]

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
  const freezeCheck = FREEZE_CHECKS.find((check) =>
    check.isFrozen({ accessState, workspace }),
  )

  if (freezeCheck) {
    logger.info(
      {
        freezeReason: freezeCheck.reason,
        ownerId: workspace.ownerId,
        workspaceId,
      },
      "Skipping workspace job for frozen workspace",
    )
    return
  }

  return await fn()
}
