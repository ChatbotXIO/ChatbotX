import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listInboxes } from "../queries"
import { listInboxesRequest, listInboxesResponse } from "../schema/action"

export const inboxesAuthenticatedAPI = {
  listInboxesAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/inboxes",
      summary: "Listar caixas de entrada",
      tags: ["Caixas de Entrada"],
    })
    .input(listInboxesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listInboxesResponse)
    .handler(async ({ input }) => await listInboxes(input)),
}
