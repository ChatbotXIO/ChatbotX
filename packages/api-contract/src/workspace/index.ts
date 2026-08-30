import { oc } from "@orpc/contract"
import { publicWorkspaceResource } from "./resource"

export const getWorkspaceContract = oc
  .route({
    method: "GET",
    path: "/v1/workspaces",
    summary: "Get workspace",
    tags: ["Workspace"],
  })
  .output(publicWorkspaceResource)

export const workspaceContract = {
  getWorkspaceContract,
}

export * from "./resource"
