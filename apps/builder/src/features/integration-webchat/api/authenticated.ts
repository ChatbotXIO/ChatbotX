import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listIntegrationWebchats } from "../queries"
import {
  listIntegrationWebchatsRequest,
  listIntegrationWebchatsResponse,
} from "../schema/query"

export const integrationWebchatAuthenticatedAPI = {
  listIntegrationWebchatsAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/integration-webchats",
      summary: "Listar integrações Webchat",
      tags: ["Integrações Webchat"],
    })
    .input(listIntegrationWebchatsRequest.and(withWorkspaceIdSchema))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listIntegrationWebchatsResponse)
    .handler(async ({ input }) => await listIntegrationWebchats(input)),
}
