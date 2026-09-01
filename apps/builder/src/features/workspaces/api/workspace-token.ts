import { workspaceTokenAuthAPI } from "@/orpc"
import { workspaceResource } from "../schema/resource"

export const workspaceWorkspaceTokenAPIs = {
  getWorkspaceWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/workspaces",
      summary: "Get workspace",
      tags: ["Workspace"],
    })
    .output(workspaceResource)
    .handler(({ context }) => context.workspace),
}

export default workspaceWorkspaceTokenAPIs
