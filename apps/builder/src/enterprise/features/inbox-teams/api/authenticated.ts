import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listInboxTeams } from "../queries"
import { listInboxTeamsRequest, listInboxTeamsResponse } from "../schema/action"

export const inboxTeamsAuthenticatedAPI = {
  listInboxTeamsAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/inbox-teams",
      summary: "Listar times da caixa de entrada",
      tags: ["Times da Caixa de Entrada"],
    })
    .input(listInboxTeamsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listInboxTeamsResponse)
    .handler(async ({ input }) => await listInboxTeams(input)),
}
