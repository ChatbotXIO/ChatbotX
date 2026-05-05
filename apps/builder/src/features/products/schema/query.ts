import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { basePaginationRequest } from "@/lib/pagination"
import { type ProductResource, productResource } from "./resource"

export const listProductsSearchParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<ProductResource>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString,
})

export type ListProductsSearchParams = Awaited<
  ReturnType<typeof listProductsSearchParams.parse>
> & {
  workspaceId: string
}

export const listProductsRequest = basePaginationRequest.extend({
  name: z.string().nullish(),
})
export type ListProductsRequest = z.infer<typeof listProductsRequest>

export const listProductsResponse = z.object({
  data: z.array(productResource),
  pageCount: z.number(),
})
export type ListProductsResponse = z.infer<typeof listProductsResponse>
