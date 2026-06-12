import { workspaceService } from "@chatbotx.io/business"
import { toPublicStorageUrl } from "./storage-url"

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
  return await toPublicStorageUrl(workspace?.logo ?? null, workspaceId)
}
