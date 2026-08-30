import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import { z } from "zod"
import { userResource } from "@/features/users/schema/resource"
import { basePaginationRequest } from "@/lib/pagination"
import { workspaceMemberResource } from "./resource"

export const getWorkspaceMembersSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger,
  perPage: parseAsInteger,
  keyword: parseAsString,
})

export type GetWorkspaceMembersSchema = Awaited<
  ReturnType<typeof getWorkspaceMembersSearchParamsCache.parse>
> & {
  workspaceId: string
}

export const listWorkspaceMembersRequest = basePaginationRequest.extend({
  workspaceId: zodBigintAsString(),
  keyword: z.string().nullish().default(null),
})
export type ListWorkspaceMembersRequest = z.infer<
  typeof listWorkspaceMembersRequest
>

export const listWorkspaceMembersResponse = z.object({
  data: z.array(
    workspaceMemberResource.extend({
      user: userResource.pick({ id: true, name: true, image: true }),
    }),
  ),
  pageCount: z.number(),
})
export type ListWorkspaceMembersResponse = z.infer<
  typeof listWorkspaceMembersResponse
>

export const getWorkspaceMemberRequest = z.object({
  memberId: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
})
export type GetWorkspaceMemberRequest = z.infer<
  typeof getWorkspaceMemberRequest
>

export const getWorkspaceMemberResponse = workspaceMemberResource.extend({
  user: userResource.pick({ id: true, name: true, image: true }),
})
export type GetWorkspaceMemberResponse = z.infer<
  typeof getWorkspaceMemberResponse
>
