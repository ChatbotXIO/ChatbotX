import { findOrFail } from "@chatbotx.io/database/client"
import {
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import type { WorkspaceMemberModel } from "@chatbotx.io/database/types"
import type { WorkspaceResource } from "@/features/workspaces/schema/resource"
import { notFoundException } from "./errors/exception"

export const findChatbotOrFail = async (
  userId: string | null | undefined,
  workspaceId: string | null,
): Promise<{
  workspace: WorkspaceResource
  workspaceMember: WorkspaceMemberModel
}> => {
  if (!userId) {
    throw notFoundException("No User found")
  }

  if (!workspaceId) {
    throw notFoundException("No Workspace found")
  }

  const workspaceMember = await findOrFail({
    table: workspaceMemberModel,
    where: {
      userId,
      workspaceId,
    },
    message: "Workspace member not found",
  })
  const workspace = await findOrFail({
    table: workspaceModel,
    where: {
      id: workspaceId,
    },
    message: "Workspace not found",
  })

  return { workspace, workspaceMember }
}
