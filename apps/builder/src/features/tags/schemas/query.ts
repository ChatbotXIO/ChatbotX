import { createSelectSchema, tagModel } from "@chatbotx.io/database/schema"
import type { TagModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { parseAsBigInt } from "@/lib/nuqs"
import { basePaginationRequest } from "@/lib/pagination"
import { publicTagResource, tagResource } from "./resource"

export const listTagsSearchParams = {
  page: parseAsInteger,
  perPage: parseAsInteger,
  name: parseAsString,
  sort: getSortingStateParser<
    TagModel & { contactsCount?: number }
  >().withDefault([{ id: "createdAt", desc: true }]),
  folderId: parseAsBigInt,
}
export const listTagsSearchParamsCache =
  createSearchParamsCache(listTagsSearchParams)

export const listTagsRequest = basePaginationRequest.and(
  z.object({
    name: z.string().nullish(),
    folderId: z.bigint().nullish(),
  }),
)
export type ListTagsRequest = z.infer<typeof listTagsRequest>

export const listTagsResponse = z.object({
  data: z.array(tagResource),
  pageCount: z.number().int(),
})
export type ListTagsResponse = z.infer<typeof listTagsResponse>

export const publicListTagsResponse = z.object({
  data: z.array(publicTagResource),
})
export type ListPublicTagResponse = z.infer<typeof publicListTagsResponse>

export const findTagRequest = createSelectSchema(tagModel)
  .pick({ id: true, chatbotId: true, folderId: true, name: true })
  .partial()
export type FindTagRequest = z.infer<typeof findTagRequest>
