import { messengerMessageTemplateService } from "@chatbotx.io/business"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  listMessengerMessageTemplatesRequest,
  listMessengerMessageTemplatesResponse,
} from "../schema/query"

export const messengerMessageTemplateInternalAPIs = {
  listMessengerMessageTemplatesInternalAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/messenger-message-templates",
      summary: "List Messenger message templates",
      tags: ["Integrations"],
    })
    .input(listMessengerMessageTemplatesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listMessengerMessageTemplatesResponse)
    .handler(
      async ({ input }) =>
        await messengerMessageTemplateService.list({ where: input }),
    ),
}
