import type { FolderType } from "@ahachat.ai/database/browser"
import { createSearchParamsCache, parseAsString } from "nuqs/server"

export const listFoldersSearchParams = createSearchParamsCache({
  folderId: parseAsString.withDefault(""),
})
export type ListFoldersSearchParams = Awaited<
  ReturnType<typeof listFoldersSearchParams.parse>
> & {
  chatbotId: string
  folderType: FolderType
  parentId?: string | null
}

export type GetCurrentFolderSchema = {
  id: string
  chatbotId: string
}
