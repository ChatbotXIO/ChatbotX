import { listInboxesRequest } from "@chatbotx.io/business"
import { createSearchParamsCache, parseAsInteger } from "nuqs/server"
import { z } from "zod"
import { inboxResource } from "./resource"

export const listInboxesNuqs = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
})

export const publishInboxesRequest = listInboxesRequest.omit({
  workspaceId: true,
})
export type PublishInboxesRequest = z.infer<typeof publishInboxesRequest>

export const publicInboxResource = inboxResource.pick({
  id: true,
  name: true,
  channel: true,
  status: true,
})

export const publicListInboxResponse = z.object({
  data: z.array(publicInboxResource),
  pageCount: z.number(),
})
export type PublicListInboxResponse = z.infer<typeof publicListInboxResponse>

export const publicListInboxesResponse = z.object({
  data: z.array(
    inboxResource
      .pick({
        name: true,
        channel: true,
        status: true,
      })
      .extend({
        // The public API exposes sourceId as id, which is not always numeric
        // (e.g. TikTok uses the account username)
        id: z.string(),
      }),
  ),
  pageCount: z.number(),
})
export type PublicListInboxesResponse = z.infer<
  typeof publicListInboxesResponse
>
