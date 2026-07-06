"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { workspaceMemberModel } from "@chatbotx.io/database/schema"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteWorkspaceMemberAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    const workspaceMember = await findOrFail({
      table: workspaceMemberModel,
      where: { id, workspaceId },
      message: "Workspace member not found",
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

    await db.delete(workspaceMemberModel).where(eq(workspaceMemberModel.id, id))

    // The removed member's cached `listByUserId` result still lists this
    // workspace; bust it so their access is revoked immediately.
    await invalidateCacheByTags([
      `users:${workspaceMember.userId}:workspace-members`,
    ])
  })
