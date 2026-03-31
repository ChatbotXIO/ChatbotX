import { chatbotAuthMiddleware } from "@/middlewares/auth"
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
      path: "/chatbots/{chatbotId}/integration-webchats",
      summary: "List Integration Webchats",
      tags: ["Integration Webchats"],
    })
    .input(listIntegrationWebchatsRequest)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listIntegrationWebchatsResponse)
    .handler(async ({ input }) => {
      return await listIntegrationWebchats(input)
    }),
}
