"use server"

import { count, db, eq } from "@chatbotx.io/database/client"
import { mediaLibraryFileModel } from "@chatbotx.io/database/schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListFoldersRequest, ListFoldersResponse } from "../schema"

export async function listMediaLibraryFolders(
  input: ListFoldersRequest,
): Promise<ListFoldersResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const [folders, fileCounts] = await Promise.all([
    db.query.mediaLibraryFolderModel.findMany({
      where: { workspaceId: input.workspaceId },
      orderBy: (t, { asc }) => [asc(t.name)],
    }),
    db
      .select({
        folderId: mediaLibraryFileModel.folderId,
        count: count(),
      })
      .from(mediaLibraryFileModel)
      .where(eq(mediaLibraryFileModel.workspaceId, input.workspaceId))
      .groupBy(mediaLibraryFileModel.folderId),
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
