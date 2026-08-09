import { workspaceTokenAuthAPI } from "@/orpc"
import { listInboxes } from "../queries"
import {
  publicListInboxesResponse,
  publicListInboxResponse,
  publishInboxesRequest,
} from "../schema/action"

export const inboxesWorkspaceTokenAPIs = {
  listInboxesWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/inboxes",
      summary: "List inboxes",
      description:
        "List inboxes with their internal IDs, including ones with a lapsed connection whose integration is still configured (check the `status` field to filter). Use `id` as the `inboxId` parameter when sending messages or flows to a contact.",
      tags: ["Channels"],
    })
    .input(publishInboxesRequest)
    .output(publicListInboxResponse)
    .handler(
      async ({ context, input }) =>
        await listInboxes({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  listChannelsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/channels",
      summary: "List channels",
      tags: ["Channels"],
    })
    .input(publishInboxesRequest)
    .output(publicListInboxesResponse)
    .handler(async ({ context, input }) => {
      const result = await listInboxes({
        ...input,
        workspaceId: context.workspace.id,
      })
      return {
        ...result,
        data: result.data.map(({ sourceId, ...inbox }) => ({
          ...inbox,
          id: sourceId,
        })),
      }
    }),
}

export default inboxesWorkspaceTokenAPIs
