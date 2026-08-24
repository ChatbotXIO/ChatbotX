import { ChatbotXException } from "@chatbotx.io/business/errors"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { workspaceActionClient } from "@/lib/safe-action"

/**
 * Shared gate for every template mutation action — applies
 * `hasWorkspacePermission(ctx.workspaceMemberPermissions, "superAdmin")`
 * once, so a new action can't forget it. `workspaceActionClient` alone only
 * verifies membership; page-level guards are bypassable by calling an
 * action directly (see `update-webchat.action.ts`'s comment for the same
 * precedent), so this check has to live in the action layer too.
 */
export const templateActionClient = workspaceActionClient.use(
  ({ ctx, next }) => {
    if (!hasWorkspacePermission(ctx.workspaceMemberPermissions, "superAdmin")) {
      throw new ChatbotXException(
        "You need to be a super admin to manage templates",
        "templateSuperAdminRequired",
        403,
      )
    }
    return next()
  },
)
