import { workspaceTokenAuthAPI } from "@/orpc"
import { listChannels } from "../queries"
import { listChannelsResponse } from "../schema/resource"

export const channelWorkspaceTokenAPIs = {
  listChannelsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/channels",
      summary: "List channels",
      tags: ["Channels"],
    })
    .output(listChannelsResponse)
    .handler(async ({ context }) => {
      return await listChannels(context.workspace.id)
    }),
}

export default channelWorkspaceTokenAPIs
