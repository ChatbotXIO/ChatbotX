import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import type { WorkspacePermissionKey } from "@/lib/auth/permission-routes"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"

const REQUIRED_PERMISSION: WorkspacePermissionKey = "superAdmin"

/**
 * The pages gate entry with `requireWorkspacePermission(…, "superAdmin")`, but
 * `workspaceActionClient` only verifies membership, so every action re-checks
 * from the permissions the middleware already loaded (no extra round-trip).
 */
export const assertCanManageInboundWebhooks = (
  permissions: WorkspaceMemberPermissions,
): void => {
  if (!hasWorkspacePermission(permissions, REQUIRED_PERMISSION)) {
    throw new Error("You need to be a super admin to manage inbound webhooks")
  }
}
