import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listWorkspaceMembers } from "../queries"
import {
  listWorkspaceMembersRequest,
  listWorkspaceMembersResponse,
} from "../schema/query"

export const workspaceMembersAuthenticatedAPI = {
  listWorkspaceMembersAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/members",
      summary: "Listar membros do workspace",
      tags: ["Membros do Workspace"],
    })
    .input(listWorkspaceMembersRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listWorkspaceMembersResponse)
    .handler(async ({ input }) => await listWorkspaceMembers(input)),
}
