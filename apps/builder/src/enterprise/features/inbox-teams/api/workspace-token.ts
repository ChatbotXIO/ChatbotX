import { workspaceTokenAuthAPI } from "@/orpc"
import { listInboxTeams } from "../queries"
import { listInboxTeamsResponse } from "../schema/action"

export const inboxTeamsWorkspaceTokenAPIs = {
  listInboxTeamsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/inbox-teams",
      summary: "Listar times da caixa de entrada",
      tags: ["Times da Caixa de Entrada"],
    })
    .output(listInboxTeamsResponse)
    .handler(
      async ({ context }) =>
        await listInboxTeams({ workspaceId: context.workspace.id }),
    ),
}

export default inboxTeamsWorkspaceTokenAPIs
