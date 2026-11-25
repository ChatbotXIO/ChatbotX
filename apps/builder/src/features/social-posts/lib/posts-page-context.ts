import type { PermissionsInput } from "@chatbotx.io/business/workspace-member/permissions"
import { notFound } from "next/navigation"
import { isCloud } from "@/env"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { getWorkspaceBlockStateForRender } from "@/lib/workspace-quota"

/**
 * What every Posts page needs before it renders: the caller's membership (404
 * when there is none) and whether the workspace is read-only. A blocked
 * (trial-expired or over-limit) cloud workspace may read but not change.
 */
export const resolvePostsPageContext = async (
  workspaceId: string,
): Promise<{ permissions: PermissionsInput; readOnly: boolean }> => {
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    return notFound()
  }
  const { blocked } = await getWorkspaceBlockStateForRender(
    userAndWorkspace.targetWorkspace.ownerId,
  )
  return {
    permissions: userAndWorkspace.targetWorkspaceMember.permissions,
    readOnly: isCloud() && blocked,
  }
}
