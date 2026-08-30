import { inboxResource, listInboxesRequest } from "@chatbotx.io/business"
import { z } from "zod"

export const listInboxesInput = listInboxesRequest.omit({
  workspaceId: true,
})
export type ListInboxesInput = z.infer<typeof listInboxesInput>

export const publicInboxResource = inboxResource.pick({
  id: true,
  name: true,
  channel: true,
  status: true,
})
export type PublicInboxResource = z.infer<typeof publicInboxResource>

export const publicListInboxResponse = z.object({
  data: z.array(publicInboxResource),
  pageCount: z.number(),
})
export type PublicListInboxResponse = z.infer<typeof publicListInboxResponse>

export const publicListChannelsResponse = z.object({
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
export type PublicListChannelsResponse = z.infer<
  typeof publicListChannelsResponse
>
