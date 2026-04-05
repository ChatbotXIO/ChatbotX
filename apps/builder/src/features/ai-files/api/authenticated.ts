import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listAIFiles } from "../queries"
import { listAIFilesRequest, listAIFilesResponse } from "../schemas"

export const aiFileAuthenticatedAPI = {
  listAIFilesAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ai-files",
      summary: "List AI files",
      tags: ["AI Files"],
    })
    .input(listAIFilesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listAIFilesResponse)
    .handler(async ({ input }) => {
      return await listAIFiles(input)
    }),
}
