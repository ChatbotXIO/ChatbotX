import { channelPostService } from "@chatbotx.io/business"
import { channelPostIntegrationTypes } from "@chatbotx.io/database/partials"
import { z } from "zod"
import { possibleErrorsOnListingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { channelPostCursor, channelPostIds } from "../schema"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

const channelPostOption = z.object({
  caption: z.string().nullable(),
  externalPostId: z.string(),
  id: z.string(),
  inboxId: z.string(),
  inboxName: z.string(),
  integrationType: channelPostIntegrationTypes,
  permalink: z.string().nullable(),
  publishedAt: z.date().nullable(),
  thumbnailUrl: z.string().nullable(),
})

const listChannelPostsRequest = z.object({
  cursor: channelPostCursor
    .optional()
    .describe("Keyset cursor returned by an earlier channel-posts request."),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(30)
    .describe("Maximum number of posts to return (1-100, default 30)."),
  search: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe("Case-insensitive substring match against the post caption."),
})

const listChannelPostsResponse = z.object({
  items: z.array(channelPostOption),
  nextCursor: channelPostCursor.optional(),
})

const getChannelPostsByIdsRequest = z.object({
  ids: channelPostIds.describe(
    "Channel post ids to resolve, with at most 100 ids in one request.",
  ),
})

const getChannelPostsByIdsResponse = z.object({
  data: z.array(channelPostOption),
})

export const channelPostsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/channel-posts",
      summary: "List channel posts available for contact filters",
      description:
        "Lists posts that have received tracked comments. Use the returned ids as values for the `commentedOnPost` contact filter.",
      tags: ["Contacts"],
    })
    .input(listChannelPostsRequest)
    .output(listChannelPostsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await channelPostService.listFilterOptions({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  listSelected: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/channel-posts/options/by-ids",
      summary: "List selected channel posts",
      description:
        "Resolves saved channel-post filter values after loading a contact filter. Returns only posts in the authenticated workspace.",
      tags: ["Contacts"],
    })
    .input(getChannelPostsByIdsRequest)
    .output(getChannelPostsByIdsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => ({
      data: await channelPostService.findByIds({
        ...input,
        workspaceId: context.workspace.id,
      }),
    })),
}
