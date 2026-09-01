import type { DynamicImageModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { dynamicImageResource } from "./resource"

export const listDynamicImagesSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  sort: getSortingStateParser<DynamicImageModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
}
export const listDynamicImagesSearchParamsCache = createSearchParamsCache(
  listDynamicImagesSearchParams,
)

export type ListDynamicImagesRequest = Awaited<
  ReturnType<typeof listDynamicImagesSearchParamsCache.parse>
> & { workspaceId: string }

export const listDynamicImagesResponse = z.object({
  data: z.array(dynamicImageResource),
  pageCount: z.number(),
})
export type ListDynamicImagesResponse = z.infer<
  typeof listDynamicImagesResponse
>
