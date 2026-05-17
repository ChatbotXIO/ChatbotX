import { folderService } from "@chatbotx.io/business"
import type { FolderType } from "@chatbotx.io/database/partials"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  GetCurrentFolderSchema,
  ListFoldersSearchParams,
} from "../schema/query"
import type { FolderResource, ListFoldersResponse } from "../schema/resource"

export const listFolders = async (
  input: ListFoldersSearchParams & { isTrash?: boolean | null },
): Promise<{ data: ListFoldersResponse["data"] }> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  const data = await folderService.list({
    workspaceId: input.workspaceId,
    folderType: input.folderType as FolderType,
    parentId: input.folderId,
    isTrash: input.isTrash,
  })
  return { data }
}

export const getCurrentFolder = async (
  input: GetCurrentFolderSchema,
): Promise<{ folder: FolderResource | null; parents: FolderResource[] }> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return folderService.getWithParents(input)
}
