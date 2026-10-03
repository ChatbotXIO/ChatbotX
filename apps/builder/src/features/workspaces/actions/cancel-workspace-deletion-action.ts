"use server"

import { workspaceService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTranslations } from "next-intl/server"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const cancelWorkspaceDeletionAction = workspaceActionClientAllowExpired
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
          "You are not authorized to restore this workspace",
        )
      }

      const { permissions } =
        currentUserAndTargetWorkspace.targetWorkspaceMember
      if (!hasWorkspacePermission(permissions, "superAdmin")) {
        throw new ChatbotXException(
          "You need to be a super admin to restore this workspace",
        )
      }

      try {
        await workspaceService.cancelDeletion({
          id: workspaceId,
        })
      } catch (err) {
        if (
          err instanceof ChatbotXException &&
          err.code === "workspaceDeletionStarted"
        ) {
          const t = await getTranslations()
          throw new ChatbotXException(
            t("workspace.deletion.alreadyStarted"),
            err.code,
            err.httpStatusCode,
          )
        }
        throw err
      }
    },
  )
