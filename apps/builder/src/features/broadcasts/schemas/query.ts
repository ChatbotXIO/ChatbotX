import type { BroadcastModel } from "@aha.chat/database/types"
import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getBroadcastsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  sort: getSortingStateParser<
    BroadcastModel & { contactsCount?: number }
  >().withDefault([{ id: "createdAt", desc: true }]),
})

export type GetBroadcastsSchema = Awaited<
  ReturnType<typeof getBroadcastsSearchParamsCache.parse>
> & { chatbotId: string }
