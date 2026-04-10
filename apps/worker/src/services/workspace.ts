import { findOrFail } from "@chatbotx.io/database/client"
import { workspaceModel } from "@chatbotx.io/database/schema"
import type { WorkspaceModel } from "@chatbotx.io/database/types"

export const workspaceService = {
  findWorkspaceById: (workspaceId: string): Promise<WorkspaceModel> => {
    return findOrFail({
      table: workspaceModel,
      where: { id: workspaceId },
      message: "Workspace not found",
    })
  },
}
