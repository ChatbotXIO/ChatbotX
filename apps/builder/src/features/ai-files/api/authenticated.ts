import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listAIFiles } from "../queries"
import { listAIFilesRequest, listAIFilesResponse } from "../schemas"

export const aiFileAuthenticatedAPI = {
  listAIFilesAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/ai-files",
      summary: "List AI files",
      tags: ["AI Files"],
    })
    .input(listAIFilesRequest)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listAIFilesResponse)
    .handler(async ({ input }) => {
      return await listAIFiles(input)
    }),
}
