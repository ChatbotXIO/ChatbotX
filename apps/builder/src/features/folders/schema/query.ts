import { createSearchParamsCache, parseAsString } from "nuqs/server"

export const listFoldersSearchParams = createSearchParamsCache({
  folderType: parseAsString,
  folderId: parseAsString,
})
export type ListFoldersSearchParams = Awaited<
  ReturnType<typeof listFoldersSearchParams.parse>
> & {
  chatbotId: bigint
}

export type GetCurrentFolderSchema = {
  id: bigint
  chatbotId: bigint
}
