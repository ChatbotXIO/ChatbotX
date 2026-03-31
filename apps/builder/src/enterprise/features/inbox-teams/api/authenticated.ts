import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listInboxTeams } from "../queries"
import { listInboxTeamsRequest, listInboxTeamsResponse } from "../schema/action"

export const inboxTeamsAuthenticatedAPI = {
  listInboxTeamsAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/inbox-teams",
      summary: "List inbox teams",
      tags: ["Inbox Teams"],
    })
    .input(listInboxTeamsRequest)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listInboxTeamsResponse)
    .handler(async ({ input }) => {
      return await listInboxTeams(input)
    }),
}
