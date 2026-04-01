import { createSearchParamsCache, parseAsString } from "nuqs/server"
import { parseAsBigInt } from "@/lib/nuqs"

export const listFoldersSearchParams = createSearchParamsCache({
  folderType: parseAsString,
  folderId: parseAsBigInt,
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
