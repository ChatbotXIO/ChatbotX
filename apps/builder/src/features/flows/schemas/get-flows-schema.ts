import { getSortingStateParser } from "@/components/data-table/parsers"
import type { Flow } from "@ahachat.ai/database"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getFlowsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<Flow>().withDefault([
    { id: "updatedAt", desc: true },
  ]),
  title: parseAsString.withDefault(""),
})

export type GetFlowsSchema = Awaited<
  ReturnType<typeof getFlowsSearchParamsCache.parse>
> & {
  chatbotId: string
  folderId: string | null | undefined
}

export type GetCurrentFlowSchema = {
  id: string
  chatbotId: string
}
