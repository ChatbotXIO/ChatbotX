import { workspaceTokenAuthAPI } from "@/orpc"
import { listConversations } from "../queries/list-conversations.query"
import { listConversationsRequest } from "../schema/query"
import { listConversationsResponse } from "../schema/resource"

export const conversationWorkspaceTokenAPIs = {
  listConversationsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/conversations",
      summary: "List conversations",
      tags: ["Conversations"],
    })
    .input(
      listConversationsRequest.omit({
        workspaceId: true,
      }),
    )
    .output(listConversationsResponse)
    .handler(async ({ context, input }) => {
      return await listConversations({
        ...input,
        workspaceId: context.workspace.id,
      })
    }),
}

export default conversationWorkspaceTokenAPIs
