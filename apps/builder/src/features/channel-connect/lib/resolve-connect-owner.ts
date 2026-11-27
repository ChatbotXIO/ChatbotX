import {
  hasWorkspaceAccess,
  isWorkspaceScheduledForDeletion,
  userQuotaService,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { UserModel } from "@chatbotx.io/database/types"
import { isCloud } from "@/env"
import {
  checkWorkspaceOwnerAccess,
  workspaceAccessDenialException,
} from "@/lib/workspace/authorize-workspace-access"

/**
 * Access + quota gate of a direct (token/credential) channel connect by a
 * signed-in user. With a `workspaceId`, the user must have access, the
 * workspace must accept mutations — the same gates as `workspaceActionClient`
 * (pending deletion; on cloud, the owner's trial/MAC block, AGENTS.md
 * invariant 14) — and the workspace owner owns the channel. Without one, a
 * new workspace is created for the user, so on cloud a trial-expired or
 * MAC-blocked user is refused.
 */
export async function resolveConnectOwnerId(props: {
  workspaceId: string | undefined
  user: UserModel
}): Promise<string> {
  const { workspaceId, user } = props
  if (workspaceId) {
    if (!(await hasWorkspaceAccess({ workspaceId, user }))) {
      throw new ChatbotXException("Workspace not found", "notFound", 404)
    }
    const workspace = await workspaceService.findOrFail({
      where: { id: workspaceId },
    })
    if (isWorkspaceScheduledForDeletion(workspace)) {
      throw new ChatbotXException(
        "Workspace deletion scheduled",
        "workspaceScheduledDeletion",
        403,
      )
    }
    const denialReason = await checkWorkspaceOwnerAccess({
      ownerId: workspace.ownerId,
    })
    if (denialReason) {
      throw workspaceAccessDenialException(denialReason)
    }
    return workspace.ownerId
  }

  if (isCloud()) {
    const { blocked, reason } = await userQuotaService.getAccessState(user.id)
    if (blocked) {
      throw reason === "mac"
        ? new ChatbotXException(
            "Monthly active contact limit reached",
            "macLimitReached",
            403,
          )
        : new ChatbotXException("Trial expired", "trialExpired", 403)
    }
  }
  return user.id
}
