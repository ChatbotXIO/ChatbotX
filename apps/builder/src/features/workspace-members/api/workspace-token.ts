import { workspaceTokenAuthAPI } from "@/orpc"
import { listWorkspaceMembers } from "../queries"
import {
  listWorkspaceMembersRequest,
  listWorkspaceMembersResponse,
} from "../schema/query"

export const workspaceMembersAPIs = {
  listChatbotMembersChatbotTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/workspace-members",
      summary: "List workspace members",
      tags: ["Members"],
    })
    .input(listWorkspaceMembersRequest)
    .output(listWorkspaceMembersResponse)
    .handler(async ({ context, input }) => {
      return await listWorkspaceMembers({
        ...input,
        workspaceId: context.workspace.id,
      })
    }),
}

export default workspaceMembersAPIs
