import { createSelectSchema, tagModel } from "@aha.chat/database/schema"
import type { TagModel } from "@aha.chat/database/types"
import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { basePaginationRequest } from "@/lib/pagination"
import { publicTagResource, tagResource } from "./resource"

export const listTagsSearchParams = {
  page: parseAsInteger,
  perPage: parseAsInteger,
  name: parseAsString,
  sort: getSortingStateParser<
    TagModel & { contactsCount?: number }
  >().withDefault([{ id: "createdAt", desc: true }]),
  folderId: parseAsString,
}
export const listTagsSearchParamsCache =
  createSearchParamsCache(listTagsSearchParams)

export const listTagsRequest = basePaginationRequest.and(
  z.object({
    name: z.string().nullish(),
    folderId: z.string().nullish(),
  }),
)
export type ListTagsRequest = z.infer<typeof listTagsRequest>

export const listTagsResponse = z.object({
  data: z.array(tagResource),
  pageCount: z.number().int().min(1),
})
export type ListTagsResponse = z.infer<typeof listTagsResponse>

export const publicLstTagsResponse = z.object({
  data: z.array(publicTagResource),
})
export type ListPublicTagResponse = z.infer<typeof publicLstTagsResponse>

export const findTagRequest = createSelectSchema(tagModel)
  .pick({ id: true, chatbotId: true, folderId: true, name: true })
  .partial()
export type FindTagRequest = z.infer<typeof findTagRequest>
