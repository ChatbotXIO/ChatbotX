import type { TagModel } from "@aha.chat/database/types"
import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getTagsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<TagModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
  folderId: parseAsString,
})

export type GetTagsSchema = Awaited<
  ReturnType<typeof getTagsSearchParamsCache.parse>
> & {
  chatbotId: string
  folderId: string | null
}
