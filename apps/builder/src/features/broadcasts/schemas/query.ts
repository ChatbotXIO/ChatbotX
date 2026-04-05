import type { BroadcastModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { publicBroadcastResource } from "./resource"

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
> & { workspaceId: string }

export const publicListBroadcastsResponse = z.object({
  data: z.array(publicBroadcastResource),
})
