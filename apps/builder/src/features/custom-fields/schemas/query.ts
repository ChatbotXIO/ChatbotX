import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { parseAsBigInt } from "@/lib/nuqs"
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
  folderId: parseAsBigInt,
  sort: getSortingStateParser<CustomFieldResource>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export type ListCustomFieldsSearchParams = Awaited<
  ReturnType<typeof listCustomFieldsSearchParams.parse>
> & {
  workspaceId: string
}

export const listCustomFieldsRequest = basePaginationRequest.extend({
  name: z.string().nullish(),
  folderId: zodBigintAsString().nullish(),
})
export type ListCustomFieldsRequest = z.infer<typeof listCustomFieldsRequest>

export const listCustomFieldsResponse = z.object({
  data: z.array(customFieldResource),
  pageCount: z.number(),
})
export type ListCustomFieldsResponse = z.infer<typeof listCustomFieldsResponse>

export const findCustomFieldRequest = customFieldResource
  .pick({ id: true, workspaceId: true, name: true })
  .partial()
export type FindCustomFieldRequest = z.infer<typeof findCustomFieldRequest>

export const listPublicCustomFieldsResponse = z.object({
  data: z.array(publicCustomFieldResource),
})
export type ListPublicCustomFieldsResponse = z.infer<
  typeof listPublicCustomFieldsResponse
>
