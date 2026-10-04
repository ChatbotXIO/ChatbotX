import { listInboxesRequest } from "@chatbotx.io/business/inbox/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
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
  sourceId: true,
  markReadOnOutbound: true,
})

export const updateInboxPublicRequest = z.object({
  id: zodBigintAsString().describe("Inbox id. Get it from `inboxes.list`."),
  markReadOnOutbound: z
    .boolean()
    .optional()
    .describe(
      "Whether the contact's unread conversation is marked read when an agent or flow sends a message to it.",
    ),
})

export const publicListInboxResponse = z.object({
  data: z.array(publicInboxResource),
  pageCount: z.number(),
})
export type PublicListInboxResponse = z.infer<typeof publicListInboxResponse>

// Back-compat for the deprecated `GET /v1/channels` alias (see
// `inboxesPublicRouter.listChannels`): the pre-consolidation response
// exposed `sourceId` as `id`, which is not always numeric (e.g. TikTok uses
// the account username).
export const publicListInboxesResponse = z.object({
  data: z.array(
    inboxResource
      .pick({
        name: true,
        channel: true,
        status: true,
      })
      .extend({
        id: z.string(),
      }),
  ),
  pageCount: z.number(),
})
export type PublicListInboxesResponse = z.infer<
  typeof publicListInboxesResponse
>
