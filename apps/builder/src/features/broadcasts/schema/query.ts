import type { BroadcastModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { publicBroadcastResource } from "./resource"

export const getBroadcastsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  sort: getSortingStateParser<
    BroadcastModel & { contactsCount?: number }
  >().withDefault([{ id: "createdAt", desc: true }]),
})

export type GetBroadcastsSchema = Awaited<
  ReturnType<typeof getBroadcastsSearchParamsCache.parse>
> & { workspaceId: string }

export const publicListBroadcastsResponse = z.object({
  data: z.array(publicBroadcastResource),
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
