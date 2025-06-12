import type { FolderType } from "@ahachat.ai/database/types"
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
