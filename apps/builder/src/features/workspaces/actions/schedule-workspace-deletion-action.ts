"use server"

import { workspaceService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { redirect } from "next/navigation"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const scheduleWorkspaceDeletionAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      const currentUserAndTargetWorkspace =
        await getCurrentUserAndTargetWorkspace(workspaceId)
      if (!currentUserAndTargetWorkspace) {
        throw new ChatbotXException(
          "You are not authorized to delete this workspace",
        )
      }

      const { permissions } =
        currentUserAndTargetWorkspace.targetWorkspaceMember
      if (!hasWorkspacePermission(permissions, "superAdmin")) {
        throw new ChatbotXException(
          "You need to be a super admin to delete this workspace",
        )
      }

      await workspaceService.scheduleDeletion({
        id: workspaceId,
      })

      redirect("/")
    },
  )
