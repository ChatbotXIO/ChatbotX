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

export const publicListInboxesResponse = z.object({
  data: z.array(
    inboxResource.pick({
      id: true,
      name: true,
      channel: true,
      status: true,
    }),
  ),
  pageCount: z.number(),
})
export type PublicListInboxesResponse = z.infer<
  typeof publicListInboxesResponse
>
