"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { workspaceMemberModel } from "@chatbotx.io/database/schema"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { isCommunity } from "@/env"
import { workspaceIdAndIdRequestParams } from "@/features/common/schemas"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  getSuperAdminPermissions,
  normalizeContactsPermissions,
} from "../helpers"
import { updateWorkspaceMemberRequest } from "../schema/mutation"

export const updateWorkspaceMemberAction = workspaceActionClient
  .inputSchema(updateWorkspaceMemberRequest)
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    const workspaceMember = await findOrFail({
      table: workspaceMemberModel,
      where: { id, workspaceId },
      message: "Workspace member not found",
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

    const updateInput = isCommunity()
      ? {
          ...parsedInput,
          permissions: getSuperAdminPermissions(),
        }
      : {
          ...parsedInput,
          permissions: normalizeContactsPermissions(parsedInput.permissions),
        }

    await db
      .update(workspaceMemberModel)
      .set(updateInput)
      .where(eq(workspaceMemberModel.id, workspaceMember.id))

    // The member's permissions/nav are served from the cached
    // `listByUserId` result; bust it so the change takes effect immediately.
    await invalidateCacheByTags([
      `users:${workspaceMember.userId}:workspace-members`,
    ])
  })
