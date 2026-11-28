import type { TagModel } from "@chatbotx.io/database/types"
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
import { publicTagResource, tagResource } from "./resource"

export const listTagsSearchParams = {
  // Defaults page the table on the server like the other list tables; the
  // list request itself keeps "no page = everything" for its other callers.
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  sort: getSortingStateParser<TagModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  folderId: parseAsBigInt,
}
export const listTagsSearchParamsCache =
  createSearchParamsCache(listTagsSearchParams)

export const listTagsRequest = basePaginationRequest.and(
  z.object({
    name: z.string().nullish(),
    folderId: zodBigintAsString().nullish(),
    workspaceId: zodBigintAsString(),
  }),
)
export type ListTagsRequest = z.infer<typeof listTagsRequest>

export const listTagsResponse = z.object({
  data: z.array(tagResource),
  pageCount: z.number().int(),
})
export type ListTagsResponse = z.infer<typeof listTagsResponse>

/** Tags per page of the picker list: the most a page can hold. */
export const TAG_OPTIONS_MAX_PER_PAGE = 50

export const listTagOptionsRequest = z.object({
  name: z.string().nullish(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce
    .number()
    .int()
    .min(1)
    .max(TAG_OPTIONS_MAX_PER_PAGE)
    .default(TAG_OPTIONS_MAX_PER_PAGE),
  workspaceId: zodBigintAsString(),
  contactId: zodBigintAsString()
    .nullish()
    .describe(
      "When set, each option also says whether this contact has the tag (`applied`).",
    ),
})
export type ListTagOptionsRequest = z.infer<typeof listTagOptionsRequest>

/** Most tag ids one applied-check can carry (the grid's loaded pages). */
export const APPLIED_TAG_IDS_MAX = 2000

export const listAppliedTagIdsRequest = z.object({
  workspaceId: zodBigintAsString(),
  contactId: zodBigintAsString(),
  tagIds: z.array(zodBigintAsString()).max(APPLIED_TAG_IDS_MAX),
})
export type ListAppliedTagIdsRequest = z.infer<typeof listAppliedTagIdsRequest>

export const listAppliedTagIdsResponse = z.object({
  appliedTagIds: z.array(z.string()),
})
export type ListAppliedTagIdsResponse = z.infer<
  typeof listAppliedTagIdsResponse
>

export const listTagOptionsResponse = z.object({
  data: z.array(
    tagResource
      .pick({ id: true, name: true, color: true })
      .extend({ applied: z.boolean().optional() }),
  ),
  pageCount: z.number().int(),
})
export type ListTagOptionsResponse = z.infer<typeof listTagOptionsResponse>

export const listTagsPublicRequest = publicListRequest.extend({
  name: z
    .string()
    .nullish()
    .describe("Case-insensitive substring match on the tag name."),
  folderId: zodBigintAsString()
    .nullish()
    .describe(
      'Folder id to filter by. Pass "0" for tags in no folder. Omit for all folders.',
    ),
  sort: publicSortRequest(["name", "createdAt", "updatedAt"]),
})

export const publicListTagsResponse = z.object({
  data: z.array(
    publicTagResource.extend({
      contactsCount: z
        .number()
        .int()
        .describe("Number of contacts that have this tag."),
    }),
  ),
  pageCount: z.number().int(),
})
export type ListPublicTagResponse = z.infer<typeof publicListTagsResponse>

export const findTagRequest = z.object({
  key: z.string(),
  folderId: zodBigintAsString().nullish(),
  workspaceId: zodBigintAsString(),
})
export type FindTagRequest = z.infer<typeof findTagRequest>
