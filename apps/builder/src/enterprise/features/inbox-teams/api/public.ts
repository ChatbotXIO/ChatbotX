import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listInboxTeams } from "../queries"
import { listInboxTeamsResponse } from "../schema/action"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

export const inboxTeamsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/teams",
      summary: "List teams",
      tags: ["Teams"],
    })
    .output(listInboxTeamsResponse)
    .handler(
      async ({ context }) =>
        await listInboxTeams({ workspaceId: context.workspace.id }),
    ),
}
