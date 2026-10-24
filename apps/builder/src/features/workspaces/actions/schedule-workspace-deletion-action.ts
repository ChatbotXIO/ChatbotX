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

export const scheduleWorkspaceDeletionAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      const t = await getTranslations()
      const currentUserAndTargetWorkspace =
        await getCurrentUserAndTargetWorkspace(workspaceId)
      if (!currentUserAndTargetWorkspace) {
        throw new ChatbotXException(t("errors.superAdminRequired"))
      }

      const { permissions } =
        currentUserAndTargetWorkspace.targetWorkspaceMember
      if (!hasWorkspacePermission(permissions, "superAdmin")) {
        throw new ChatbotXException(t("errors.superAdminRequired"))
      }

      await workspaceService.scheduleDeletion({
        actorId: currentUserAndTargetWorkspace.user.id,
        id: workspaceId,
      })
    },
  )
