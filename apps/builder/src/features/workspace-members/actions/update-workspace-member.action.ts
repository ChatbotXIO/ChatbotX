"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { workspaceMemberModel } from "@chatbotx.io/database/schema"
import { workspaceIdAndIdRequestParams } from "@/features/common/schemas"
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

    const permissions =
      currentUserAndTargetChatbot.targetWorkspaceMember.permissions
    if (!permissions.superAdmin) {
      throw new ChatbotXException(
        "You are not authorized to update this workspace member. You need to be a super admin to do this.",
      )
    }

    await db
      .update(workspaceMemberModel)
      .set(parsedInput)
      .where(eq(workspaceMemberModel.id, workspaceMember.id))

    revalidateCacheTags(`workspaces:${workspaceId}#workspaceMembers`)
  })
