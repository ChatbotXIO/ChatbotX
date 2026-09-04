import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import { z } from "zod"
import { basePaginationRequest } from "@/lib/pagination"

export const getAdminWorkspacesSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger,
  perPage: parseAsInteger,
  keyword: parseAsString,
})

export type GetAdminWorkspacesSchema = Awaited<
  ReturnType<typeof getAdminWorkspacesSearchParamsCache.parse>
>

export const listAdminWorkspacesRequest = basePaginationRequest.extend({
  keyword: z.string().nullish().default(null),
})
export type ListAdminWorkspacesRequest = z.infer<
  typeof listAdminWorkspacesRequest
>

export const listAdminWorkspacesResponse = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      ownerId: z.string(),
      ownerName: z.string().nullable(),
      ownerEmail: z.string(),
      tenantId: z.string(),
      tenantName: z.string().nullable(),
      createdAt: z.date(),
      supportAccessUntil: z.date().nullable(),
    }),
  ),
  pageCount: z.number(),
})
export type ListAdminWorkspacesResponse = z.infer<
  typeof listAdminWorkspacesResponse
>
