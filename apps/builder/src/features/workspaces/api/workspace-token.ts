import { workspaceTokenAuthAPI } from "@/orpc"
import { chatbotResource } from "../schema/resource"

export const workspaceWorkspaceTokenAPIs = {
  getWorkspaceWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/workspaces",
      summary: "Get workspace",
      tags: ["Workspace"],
    })
    .output(chatbotResource)
    .handler(({ context }) => context.workspace),
}

export default workspaceWorkspaceTokenAPIs
