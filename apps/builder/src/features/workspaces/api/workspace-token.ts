import { workspaceTokenAuthAPI } from "@/orpc"
import { getWorkspacePublicResource } from "../schema/action"

export const workspaceWorkspaceTokenAPIs = {
  getWorkspaceWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/workspace",
      summary: "Get workspace",
      tags: ["Workspace"],
    })
    .output(getWorkspacePublicResource)
    .handler(({ context }) => {
      return context.workspace
    }),
}

export default workspaceWorkspaceTokenAPIs
