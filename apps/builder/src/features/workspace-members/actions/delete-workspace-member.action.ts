"use server"

import {
  workspaceMemberCacheTag,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const deleteWorkspaceMemberAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    const workspaceMember = await workspaceMemberService.findByIdOrFail({
      id,
      workspaceId,
    })

    if (workspaceMember.role === "owner") {
      throw new ChatbotXException(
        "You cannot delete the owner of the workspace",
      )
    }

    const currentUserAndTargetChatbot =
      await getCurrentUserAndTargetWorkspace(workspaceId)
    if (!currentUserAndTargetChatbot) {
      throw new ChatbotXException(
        "You are not authorized to delete this workspace member",
      )
    }

    const permissions =
      currentUserAndTargetChatbot.targetWorkspaceMember.permissions
    if (!hasWorkspacePermission(permissions, "superAdmin")) {
      throw new ChatbotXException(
        "You are not authorized to delete this workspace member. You need to be a super admin to do this.",
      )
    }

    await workspaceMemberService.delete({ id, workspaceId })

    // The removed member's cached `listByUserId` result still lists this
    // workspace; bust it so their access is revoked immediately.
    await invalidateCacheByTags([
      workspaceMemberCacheTag(workspaceMember.userId),
    ])
  })
