import {
  workspaceMemberPermissionsSchema,
  workspaceMemberRoles,
} from "@chatbotx.io/database/partials"
import type {
  WorkspaceMemberModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"

/**
 * "Admin" of a workspace: its owner, or any member granted the `superAdmin`
 * permission. This is the bar for cross-workspace operations such as cloning
 * a Messenger template onto another workspace's page — being a plain agent
 * there is not enough. `permissions` is a jsonb column, so it is parsed
 * rather than trusted.
 */
export function isWorkspaceAdminMember(
  member: Pick<WorkspaceMemberModel, "role" | "permissions">,
): boolean {
  if (member.role === workspaceMemberRoles.enum.owner) {
    return true
  }
  const permissions = workspaceMemberPermissionsSchema
    .partial()
    .safeParse(member.permissions)
  return permissions.success && permissions.data.superAdmin === true
}

/**
 * Owner opt-in check. True while `Workspace.supportAccessUntil` is set and
 * in the future — the window the owner enabled via Settings → General. This
 * is the sole gate for platform support access: a super admin is granted a
 * synthetic membership for the workspace whenever this is true, with no
 * separate grant/revoke row. See docs/support-access.md.
 */
export function isSupportAccessEnabled(
  workspace: Pick<WorkspaceModel, "supportAccessUntil">,
): boolean {
  return (
    !!workspace.supportAccessUntil && workspace.supportAccessUntil > new Date()
  )
}
