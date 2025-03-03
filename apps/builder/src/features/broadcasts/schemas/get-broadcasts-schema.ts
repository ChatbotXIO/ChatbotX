import type { Broadcast, Flow } from "@ahachat.ai/database"
import { createSearchParamsCache, parseAsInteger } from "nuqs/server"

export const getBroadcastsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
})

export type GetBroadcastsSchema = Awaited<
  ReturnType<typeof getBroadcastsSearchParamsCache.parse>
> & { chatbotId: string }

export type BroadcastResource = Broadcast & {
  flow?: Flow
  _count?: {
    contacts?: number
  }
}
