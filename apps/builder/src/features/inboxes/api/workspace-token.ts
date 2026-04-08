import { workspaceTokenAuthAPI } from "@/orpc"
import { listInboxes } from "../queries"
import {
  publicListInboxesResponse,
  publishInboxesRequest,
} from "../schema/action"

export const inboxesWorkspaceTokenAPIs = {
  listInboxesWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/channels",
      summary: "List channels",
      tags: ["Channels"],
    })
    .input(publishInboxesRequest)
    .output(publicListInboxesResponse)
    .handler(async ({ context, input }) => {
      return await listInboxes({ ...input, workspaceId: context.workspace.id })
    }),
}

export default inboxesWorkspaceTokenAPIs
