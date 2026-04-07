import { workspaceTokenAuthAPI } from "@/orpc"
import { findChatbotOrFail } from "../queries"
import { chatbotResource } from "../schema/resource"

export const workspaceWorkspaceTokenAPIs = {
  getWorkspaceWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/workspace",
      summary: "Get workspace",
      tags: ["Workspace"],
    })
    .output(chatbotResource.omit({ token: true }))
    .handler(async ({ context }) => {
      return await findChatbotOrFail({ id: context.workspace.id })
    }),
}

export default workspaceWorkspaceTokenAPIs
