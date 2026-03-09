import { createSelectSchema, fieldModel } from "@aha.chat/database/schema"
import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { basePaginationRequest } from "@/lib/pagination"
import {
  type CustomFieldResource,
  customFieldResource,
  publicCustomFieldResource,
} from "./resource"

export const listCustomFieldsSearchParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  folderId: parseAsString,
  sort: getSortingStateParser<CustomFieldResource>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export type ListCustomFieldsSearchParams = Awaited<
  ReturnType<typeof listCustomFieldsSearchParams.parse>
> & {
  chatbotId: string
}

export const listCustomFieldsRequest = basePaginationRequest.extend({
  name: z.string().nullish(),
  folderId: z.string().nullish(),
})
export type ListCustomFieldsRequest = z.infer<typeof listCustomFieldsRequest>

export const listCustomFieldsResponse = z.object({
  data: z.array(customFieldResource),
  pageCount: z.number(),
})
export type ListCustomFieldsResponse = z.infer<typeof listCustomFieldsResponse>

export const findCustomFieldRequest = createSelectSchema(fieldModel)
  .pick({ id: true, chatbotId: true, name: true })
  .partial()
export type FindCustomFieldRequest = z.infer<typeof findCustomFieldRequest>

export const listPublicCustomFieldsResponse = z.object({
  data: z.array(publicCustomFieldResource),
})
export type ListPublicCustomFieldsResponse = z.infer<
  typeof listPublicCustomFieldsResponse
>
