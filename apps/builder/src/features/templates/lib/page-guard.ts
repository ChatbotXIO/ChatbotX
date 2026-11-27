import { canViewTemplateInstalls } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { type MemberPermissions, memberActor } from "./actor"

/**
 * 404s unless the current user may see this workspace's template installs;
 * otherwise hands back the permissions and the matching actor, so the
 * installs pages share one gate.
 */
export const requireTemplateInstallsAccess = async (workspaceId: string) => {
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  const permissions: MemberPermissions | undefined =
    userAndWorkspace?.targetWorkspaceMember.permissions
  if (!(permissions && canViewTemplateInstalls(permissions))) {
    notFound()
  }
  return { permissions, actor: memberActor(permissions) }
}

// Snowflake ids are digit strings; anything else is a forged cursor.
const CURSOR_PATTERN = /^\d{1,20}$/

export const parseCursor = (cursor: string | undefined): string | undefined =>
  cursor && CURSOR_PATTERN.test(cursor) ? cursor : undefined
