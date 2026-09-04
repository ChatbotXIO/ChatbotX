"use server"

import { workspaceSupportAccessService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { workspaceActionClientAllowScheduledDeletion } from "@/lib/safe-action"
import {
  type ToggleSupportAccessRequest,
  toggleSupportAccessRequest,
} from "../schema/update-workspace-schema"

export const toggleSupportAccessAction =
  workspaceActionClientAllowScheduledDeletion
    .bindArgsSchemas(workspaceIdrequestParams)
    .inputSchema(toggleSupportAccessRequest)
    .action(
      async ({
        bindArgsParsedInputs: [workspaceId],
        parsedInput,
      }: {
        bindArgsParsedInputs: WorkspaceIdRequestParams
        parsedInput: ToggleSupportAccessRequest
      }) => {
        const currentUserAndTargetWorkspace =
          await getCurrentUserAndTargetWorkspace(workspaceId)
        if (!currentUserAndTargetWorkspace) {
          throw new ChatbotXException(
            "You are not authorized to update this workspace",
          )
        }

        const { permissions } =
          currentUserAndTargetWorkspace.targetWorkspaceMember
        if (!hasWorkspacePermission(permissions, "superAdmin")) {
          throw new ChatbotXException(
            "You need to be a super admin to change platform support access",
          )
        }

        const actorUserId = currentUserAndTargetWorkspace.user.id

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
