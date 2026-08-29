import { workspaceMemberService } from "@chatbotx.io/business"
import z from "zod"
import { authorizedAPI } from "@/orpc"
import { getWorkspacePublicResource } from "../schema/action"

export const workspacesAuthenticatedAPI = {
  listMyWorkspacesAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/users/me/workspaces",
      summary: "List workspaces the current user is a member of",
      tags: ["Workspaces"],
    })
    .input(z.object({}))
    .output(z.object({ workspaces: z.array(getWorkspacePublicResource) }))
    .handler(async ({ context }) => {
      const members = await workspaceMemberService.listByUserId({
        userId: context.user.id,
      })
      return { workspaces: members.map((member) => member.workspace) }
    }),
}
