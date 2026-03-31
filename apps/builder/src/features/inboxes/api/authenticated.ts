import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listInboxes } from "../queries"
import { listInboxesRequest, listInboxesResponse } from "../schema/action"

export const inboxesAuthenticatedAPI = {
  listInboxesAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/inboxes",
      summary: "List inboxes",
      tags: ["Inboxes"],
    })
    .input(listInboxesRequest)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listInboxesResponse)
    .handler(async ({ input }) => {
      return await listInboxes(input)
    }),
}
