import {
  createSearchParamsCache,
  parseAsString
} from "nuqs/server"

export const getTagsSearchParamsCache = createSearchParamsCache({
  folderId: parseAsString
})

export type GetTagsSchema = {
  chatbotId: string,
  folderId: string | null,
}

