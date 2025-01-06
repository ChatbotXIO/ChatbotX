import { getSortingStateParser } from "@/components/data-table/parsers"
import { Tag } from "@ahachat.ai/database"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString
} from "nuqs/server"

export const getTagsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  action: parseAsString.withDefault(""),
  sort: getSortingStateParser<Tag>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
  folderId: parseAsString
})

export type GetTagsSchema = Awaited<ReturnType<typeof getTagsSearchParamsCache.parse>> & {
  chatbotId: string,
  folderId: string | null,
}

