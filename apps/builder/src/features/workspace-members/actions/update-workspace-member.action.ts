"use server"

import { isDeepStrictEqual } from "node:util"
import { workspaceMemberService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateWorkspaceMemberRequest } from "../schema/mutation"

export const updateWorkspaceMemberAction = workspaceActionClient
  .inputSchema(updateWorkspaceMemberRequest)
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    const workspaceMember = await workspaceMemberService.findByIdOrFail({
      id,
      workspaceId,
    })

    const currentUserAndTargetChatbot =
      await getCurrentUserAndTargetWorkspace(workspaceId)
    if (!currentUserAndTargetChatbot) {
      throw new ChatbotXException(
        "You are not authorized to update this workspace member",
      )
    }

    const permissions =
      currentUserAndTargetChatbot.targetWorkspaceMember.permissions
    if (!hasWorkspacePermission(permissions, "superAdmin")) {
      throw new ChatbotXException(
        "You are not authorized to update this workspace member. You need to be a super admin to do this.",
      )
    }

    const updateInput = workspaceMemberService.normalizeUpdateData(parsedInput)

    const permissionsChanged = !isDeepStrictEqual(
      workspaceMember.permissions,
      updateInput.permissions,
    )
    const notificationsChanged = !(
      isDeepStrictEqual(
        workspaceMember.notificationTypes,
        updateInput.notificationTypes,
      ) &&
      isDeepStrictEqual(
        workspaceMember.notificationChannels,
        updateInput.notificationChannels,
      )
    )

    // updateWorkspaceMemberRequest currently has exactly these 3 fields, so
    // this covers every field in updateInput. If a new field is added to the
    // schema, it MUST be added to permissionsChanged/notificationsChanged (or
    // diffed separately) below, or it will silently never be persisted.
    if (!(permissionsChanged || notificationsChanged)) {
      return
    }

    const updated = await workspaceMemberService.updateMember({
      id: workspaceMember.id,
      workspaceId,
      data: updateInput,
    })

    if (!updated) {
      return
    }
  })
