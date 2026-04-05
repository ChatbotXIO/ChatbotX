import type { ReflinkModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { customFieldResource } from "@/features/custom-fields/schemas/resource"
import { flowResource } from "@/features/flows/schemas/resource"
import { reflinkResource } from "./resource"

export const listReflinksSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  keyword: parseAsString,
  sort: getSortingStateParser<ReflinkModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
}
export const listReflinksSearchParamsCache = createSearchParamsCache(
  listReflinksSearchParams,
)

export type ListReflinksRequest = Awaited<
  ReturnType<typeof listReflinksSearchParamsCache.parse>
> & { workspaceId: string }

export const listReflinkItem = reflinkResource.and(
  z.object({
    flow: flowResource,
    customField: customFieldResource.nullable(),
  }),
)
export type ListReflinkItem = z.infer<typeof listReflinkItem>

export const listReflinksResponse = z.object({
  data: z.array(listReflinkItem),
  pageCount: z.number(),
})
export type ListReflinksResponse = z.infer<typeof listReflinksResponse>
