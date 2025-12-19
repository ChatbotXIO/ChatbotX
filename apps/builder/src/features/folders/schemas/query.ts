import { createSearchParamsCache, parseAsString } from "nuqs/server"

export const listFoldersSearchParams = createSearchParamsCache({
  folderType: parseAsString,
  folderId: parseAsString,
})
export type ListFoldersSearchParams = Awaited<
  ReturnType<typeof listFoldersSearchParams.parse>
> & {
  chatbotId: string
}

export type GetCurrentFolderSchema = {
  id: string
  chatbotId: string
}
