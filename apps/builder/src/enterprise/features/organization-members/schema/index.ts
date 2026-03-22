import {
  createSelectSchema,
  organizationMemberModel,
} from "@aha.chat/database/schema"
import { getSortingStateParser } from "@aha.chat/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { userResource } from "@/features/users/schemas/resource"
import { basePaginationRequest } from "@/lib/pagination"

export const organizationMemberResource = createSelectSchema(
  organizationMemberModel,
)
export const OrganizationMemberResource = organizationMemberResource

export const listOrganizationMembersSearchParams = {
  page: parseAsInteger,
  perPage: parseAsInteger,
  name: parseAsString,
  sort: getSortingStateParser<ListOrganizationMemberItem>().withDefault([
    { id: "createdAt", desc: true },
  ]),
}
export const listOrganizationMembersSearchParamsCache = createSearchParamsCache(
  listOrganizationMembersSearchParams,
)

export const listOrganizationMembersRequest = basePaginationRequest.and(
  z.object({
    keyword: z.string().nullish(),
  }),
)
export type ListOrganizationMembersRequest = Awaited<
  ReturnType<typeof listOrganizationMembersRequest.parse>
>

export const listOrganizationMemberItemResponse =
  organizationMemberResource.and(z.object({ user: userResource }))
export type ListOrganizationMemberItem = z.infer<
  typeof listOrganizationMemberItemResponse
>

export const listOrganizationMembersResponse = z.object({
  data: z.array(listOrganizationMemberItemResponse),
  pageCount: z.number(),
})
export type ListOrganizationMembersResponse = z.infer<
  typeof listOrganizationMembersResponse
>
