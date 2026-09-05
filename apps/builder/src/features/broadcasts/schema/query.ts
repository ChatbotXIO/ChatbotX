import type { BroadcastModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import { createSearchParamsCache, parseAsInteger } from "nuqs/server"
import z from "zod"
import type { BroadcastFilterStatus } from "../lib/broadcast-status"
import { publicBroadcastResource } from "./resource"
import { broadcastsSearchParsers } from "./search-parsers"

export const getBroadcastsSearchParamsCache = createSearchParamsCache({
  ...broadcastsSearchParsers,
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<
    BroadcastModel & { contactsCount?: number }
  >().withDefault([{ id: "createdAt", desc: true }]),
})

type ParsedBroadcastsSearchParams = Awaited<
  ReturnType<typeof getBroadcastsSearchParamsCache.parse>
>

export type GetBroadcastsSchema = Omit<
  ParsedBroadcastsSearchParams,
  "view" | "range" | "date" | "endDate" | "status"
> & {
  workspaceId: string
  status?: BroadcastFilterStatus | null
}

export const publicListBroadcastsResponse = z.object({
  data: z.array(publicBroadcastResource),
  pageCount: z.number().int(),
})

export const broadcastAudienceContactResource = z.object({
  id: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  avatar: z.string().nullable(),
  gender: z.string().nullable(),
})

export const broadcastAudienceItemResource = z.object({
  contactId: z.string(),
  contact: broadcastAudienceContactResource,
  sent: z.boolean(),
})

export const listBroadcastAudienceResponse = z.object({
  data: z.array(broadcastAudienceItemResource),
  pageCount: z.number(),
})
export type ListBroadcastAudienceResponse = z.infer<
  typeof listBroadcastAudienceResponse
>
