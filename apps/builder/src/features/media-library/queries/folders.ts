"use server"

import {
  mediaLibraryFileRepository,
  mediaLibraryFolderRepository,
} from "@chatbotx.io/database/repositories"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListFoldersRequest, ListFoldersResponse } from "../schema"

export async function listMediaLibraryFolders(
  input: ListFoldersRequest,
): Promise<ListFoldersResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const [folders, fileCounts] = await Promise.all([
    mediaLibraryFolderRepository.listByWorkspace({
      workspaceId: input.workspaceId,
    }),
    mediaLibraryFileRepository.countByFolder({
      workspaceId: input.workspaceId,
    }),
  ])

  const fileCountByFolderId = new Map(
    fileCounts.map((row) => [row.folderId, row.count]),
  )

  return {
    data: folders.map((folder) => ({
      ...folder,
      fileCount: fileCountByFolderId.get(folder.id) ?? 0,
    })),
  }
}
