import type { MagicLinkModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { magicLinkResource } from "./resource"

export const listMagicLinksSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString,
  sort: getSortingStateParser<MagicLinkModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
}
export const listMagicLinksSearchParamsCache = createSearchParamsCache(
  listMagicLinksSearchParams,
)

export type ListMagicLinksRequest = Awaited<
  ReturnType<typeof listMagicLinksSearchParamsCache.parse>
> & { workspaceId: string }

export const listMagicLinkItem = magicLinkResource
export type ListMagicLinkItem = z.infer<typeof listMagicLinkItem>

export const listMagicLinksResponse = z.object({
  data: z.array(listMagicLinkItem),
  pageCount: z.number(),
})
export type ListMagicLinksResponse = z.infer<typeof listMagicLinksResponse>
