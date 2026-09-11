import { mediaLibraryService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListFoldersRequest, ListFoldersResponse } from "../schema"

export async function listMediaLibraryFolders(
  input: ListFoldersRequest,
): Promise<ListFoldersResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return {
    data: await mediaLibraryService.listFolders({
      workspaceId: input.workspaceId,
    }),
  }
}
