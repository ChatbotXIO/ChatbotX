import { workspaceTokenAuthAPI } from "@/orpc"
import { listInboxTeams } from "../queries"
import { listInboxTeamsResponse } from "../schema/action"

export const inboxTeamsWorkspaceTokenAPIs = {
  listInboxTeamsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/inbox-teams",
      summary: "List inbox teams",
      tags: ["Inbox Teams"],
    })
    .output(listInboxTeamsResponse)
    .handler(
      async ({ context }) =>
        await listInboxTeams({ workspaceId: context.workspace.id }),
    ),
}

export default inboxTeamsWorkspaceTokenAPIs
