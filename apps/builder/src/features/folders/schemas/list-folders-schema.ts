import type { FolderType } from "@aha.chat/database/types"
import { createSearchParamsCache, parseAsString } from "nuqs/server"

export const listFoldersSearchParams = createSearchParamsCache({
  folderId: parseAsString,
})
export type ListFoldersSearchParams = Awaited<
  ReturnType<typeof listFoldersSearchParams.parse>
> & {
  chatbotId: string
  folderType: FolderType
}

export type GetCurrentFolderSchema = {
  id: string
  chatbotId: string
}
