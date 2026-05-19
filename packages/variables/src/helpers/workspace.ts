import { workspaceService } from "@chatbotx.io/services"

export const getWorkspaceName = async (
  workspaceId: string,
): Promise<string | null> => {
  const workspace = await workspaceService.findById({ id: workspaceId })
  return workspace?.name ?? null
}

export const getWorkspaceImageUrl = async (
  workspaceId: string,
): Promise<string | null> => {
  const workspace = await workspaceService.findById({ id: workspaceId })
  return workspace?.logo ?? null
}
