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
import { publicListRequest, publicSortRequest } from "@/lib/public-api/list"
import {
  type CustomFieldResource,
  customFieldResource,
  publicCustomFieldDefinitionResource,
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

export const findCustomFieldByKeyRequest = z.object({
  key: z.string(),
  workspaceId: z.string(),
})
export type FindCustomFieldByKeyRequest = z.infer<
  typeof findCustomFieldByKeyRequest
>

export const listCustomFieldsPublicRequest = publicListRequest.extend({
  name: z
    .string()
    .nullish()
    .describe("Case-insensitive substring match on the custom field name."),
  folderId: zodBigintAsString()
    .nullish()
    .describe(
      'Folder id to filter by. Pass "0" for fields in no folder. Omit for all folders.',
    ),
  sort: publicSortRequest(["name", "createdAt", "updatedAt"]),
})

export const listPublicCustomFieldsResponse = z.object({
  data: z.array(publicCustomFieldDefinitionResource),
  pageCount: z.number().int(),
})
export type ListPublicCustomFieldsResponse = z.infer<
  typeof listPublicCustomFieldsResponse
>
