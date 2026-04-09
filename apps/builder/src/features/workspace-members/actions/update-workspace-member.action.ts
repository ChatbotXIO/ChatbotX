"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { workspaceMemberModel } from "@chatbotx.io/database/schema"
import { workspaceIdAndIdRequestParams } from "@/features/common/schemas"
import {
  canAccessWorkspace,
  workspacePermissions,
} from "@/lib/auth/permissions"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
import { workspaceActionClient } from "@/lib/safe-action"
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
      await getCurrentUserAndTargetChatbot(workspaceId)
    if (!currentUserAndTargetChatbot) {
      throw new ChatbotXException(
        "You are not authorized to update this workspace member",
      )
    }

    const canUpdateMember = canAccessWorkspace(
      currentUserAndTargetChatbot.targetWorkspaceMember,
      workspacePermissions.updateMember,
    )
    if (!canUpdateMember) {
      throw new ChatbotXException(
        "You are not authorized to update this workspace member.",
      )
    }

    await db
      .update(workspaceMemberModel)
      .set(parsedInput)
      .where(eq(workspaceMemberModel.id, workspaceMember.id))

    revalidateCacheTags(`workspaces:${workspaceId}#workspaceMembers`)
  })
