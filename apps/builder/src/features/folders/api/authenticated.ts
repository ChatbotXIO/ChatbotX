import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listFolders } from "../queries"
import { listFoldersRequest, listFoldersResponse } from "../schema/resource"

export const foldersAuthenticatedAPI = {
  listFoldersAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/folders",
      summary: "List folders",
      tags: ["Folders"],
    })
    .input(listFoldersRequest)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listFoldersResponse)
    .handler(async ({ input }) => {
      return await listFolders(input)
    }),
}
