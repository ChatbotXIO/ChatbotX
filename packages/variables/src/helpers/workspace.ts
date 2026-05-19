import { workspaceService } from "@chatbotx.io/business"

export const getWorkspaceName = async (
  workspaceId: string,
): Promise<string | null> => {
  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  return workspace?.name ?? null
}

export const getWorkspaceImageUrl = async (
  workspaceId: string,
): Promise<string | null> => {
  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  return workspace?.logo ?? null
}
