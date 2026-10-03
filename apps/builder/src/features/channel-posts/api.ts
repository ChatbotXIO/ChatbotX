import { channelPostService } from "@chatbotx.io/business"
import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { channelPostCursor, channelPostIds, channelPostOption } from "./schema"

const listRequest = z.object({
  workspaceId: z.string(),
  cursor: channelPostCursor.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().min(1).max(200).optional(),
})

const listResponse = z.object({
  items: z.array(channelPostOption),
  nextCursor: channelPostCursor.optional(),
})

const findByIdsRequest = z.object({
  ids: channelPostIds,
  workspaceId: z.string(),
})

const findByIdsResponse = z.object({ data: z.array(channelPostOption) })

export const channelPostAPIs = {
  privateListChannelPostOptionsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/channel-posts/options",
      summary: "List channel post filter options",
      tags: ["Channel posts"],
    })
    .input(listRequest)
    .output(listResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(
      async ({ input }) => await channelPostService.listFilterOptions(input),
    ),

  privateGetChannelPostOptionsByIdsAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/channel-posts/options/by-ids",
      summary: "Get channel post filter options by id",
      tags: ["Channel posts"],
    })
    .input(findByIdsRequest)
    .output(findByIdsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => ({
      data: await channelPostService.findByIds(input),
    })),
}
