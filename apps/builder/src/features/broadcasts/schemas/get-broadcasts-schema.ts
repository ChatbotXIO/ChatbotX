import type { BroadcastModel, FlowModel } from "@aha.chat/database/types"
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
  sort: getSortingStateParser<BroadcastModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export type GetBroadcastsSchema = Awaited<
  ReturnType<typeof getBroadcastsSearchParamsCache.parse>
> & { chatbotId: string }

export type BroadcastResource = BroadcastModel & {
  flow?: FlowModel
  _count?: {
    contacts?: number
  }
}
