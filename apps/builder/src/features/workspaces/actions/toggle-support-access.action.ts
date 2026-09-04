"use server"

import { workspaceSupportAccessService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { workspaceActionClientAllowScheduledDeletion } from "@/lib/safe-action"
import { toggleSupportAccessRequest } from "../schema/update-workspace-schema"

export const toggleSupportAccessAction =
  workspaceActionClientAllowScheduledDeletion
    .bindArgsSchemas(workspaceIdrequestParams)
    .inputSchema(toggleSupportAccessRequest)
    .action(
      async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
        if (
          !hasWorkspacePermission(ctx.workspaceMemberPermissions, "superAdmin")
        ) {
          throw new ChatbotXException(
            "You need to be a super admin to change platform support access",
          )
        }

        // A support session's synthetic membership also carries `superAdmin:
        // true` (see docs/support-access.md), so the check above alone would
        // let the platform super admin renew their own time-boxed window
        // indefinitely — the caller must hold a *real* membership row.
        if (ctx.isSupportSession) {
          throw new ChatbotXException(
            "Platform support access cannot be changed from within a support session",
          )
        }

        const actorUserId = ctx.user.id

        if (parsedInput.enabled) {
          await workspaceSupportAccessService.enable({
            workspaceId,
            actorUserId,
          })
        } else {
          await workspaceSupportAccessService.disable({
            workspaceId,
            actorUserId,
          })
        }
      },
    )
