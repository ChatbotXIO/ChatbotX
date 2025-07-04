import type { BroadcastModel, FlowModel } from "@ahachat.ai/database/types"
import { createSearchParamsCache, parseAsInteger } from "nuqs/server"

export const getBroadcastsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
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
