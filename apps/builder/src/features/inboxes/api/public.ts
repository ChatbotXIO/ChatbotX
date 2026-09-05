import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listInboxes } from "../queries"
import {
  publicListInboxesResponse,
  publicListInboxResponse,
  publishInboxesRequest,
} from "../schema/action"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

export const inboxesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/inboxes",
      summary: "List inboxes",
      description:
        "List connected inboxes with their internal IDs. Use `id` as the `inboxId` parameter when sending messages or flows to a contact.",
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

  listChannels: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/channels",
      summary: "List channels",
      description:
        "Deprecated — use `inboxes.list` instead. Kept for backward compatibility; hidden from MCP/CLI tool listings.",
      deprecated: true,
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
