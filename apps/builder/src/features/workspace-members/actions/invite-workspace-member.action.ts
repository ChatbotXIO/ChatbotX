"use server"

import { invitationService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { inviteWorkspaceMemberRequest } from "../schema/mutation"

export const inviteWorkspaceMemberAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(inviteWorkspaceMemberRequest)
  .action(async ({ ctx, parsedInput, bindArgsParsedInputs: [workspaceId] }) => {
    const currentUserAndTargetChatbot =
      await getCurrentUserAndTargetWorkspace(workspaceId)
    if (!currentUserAndTargetChatbot) {
      throw new ChatbotXException(
        "You are not authorized to invite a workspace member",
      )
    }

    const currentPermissions =
      currentUserAndTargetChatbot.targetWorkspaceMember.permissions
    if (!hasWorkspacePermission(currentPermissions, "superAdmin")) {
      throw new ChatbotXException(
        "You are not authorized to invite a workspace member. You need to be a super admin to do this.",
      )
    }

    const invitation = await invitationService.create({
      workspaceId,
      permissions: parsedInput.permissions,
      invitedBy: ctx.user.id,
    })

    return invitation
  })
