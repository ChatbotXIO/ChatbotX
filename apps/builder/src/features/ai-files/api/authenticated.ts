import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listAIFiles } from "../queries"
import { listAIFilesRequest, listAIFilesResponse } from "../schemas"

export const aiFileAuthenticatedAPI = {
  listAIFilesAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ai-files",
      summary: "Listar arquivos de IA",
      tags: ["Arquivos de IA"],
    })
    .input(listAIFilesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listAIFilesResponse)
    .handler(async ({ input }) => await listAIFiles(input)),
}
