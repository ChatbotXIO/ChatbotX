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

// Same cap as the service's `MAX_INBOX_AVATARS` (kept local: this schema is
// also read by client code, which must not import the business root).
const MAX_INBOX_AVATAR_IDS = 50

export const listInboxAvatarsPublicRequest = z.object({
  inboxIds: z
    // One `?inboxIds=` value arrives as a string; repeated values as an array.
    .preprocess(
      (value) => (typeof value === "string" ? [value] : value),
      z.array(zodBigintAsString()).min(1).max(MAX_INBOX_AVATAR_IDS),
    )
    .describe(
      "Inboxes to read, at most 50. Get ids from `inboxes.list` or from a conversation's `contactInboxes[].inboxId`.",
    ),
})

export const listInboxAvatarsRequest = listInboxAvatarsPublicRequest.extend({
  workspaceId: zodBigintAsString(),
})

export const inboxAvatarResource = z.object({
  inboxId: z.string().describe("The inbox the picture belongs to."),
  avatar: z
    .string()
    .nullable()
    .describe(
      "URL of the page's profile picture, the same one the Posts pickers show. Null when the page has no picture or it cannot be read now (for example a disconnected inbox).",
    ),
})
export type InboxAvatarResource = z.infer<typeof inboxAvatarResource>

export const listInboxAvatarsResponse = z.object({
  data: z
    .array(inboxAvatarResource)
    .describe(
      "One entry per requested inbox whose channel has a page picture (Facebook, Instagram, Threads). Inboxes of other channels or of another workspace are left out.",
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
