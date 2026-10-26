import { aiFileService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listAIFiles } from "../queries"
import { listAIFilesRequest, listAIFilesResponse } from "../schema"
import { listAIFileChunksRequest, publicAIFileResource } from "../schema/public"

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
    .handler(async ({ input }) => await listAIFiles(input)),

  getAIFileAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ai-files/{id}",
      summary: "Get AI file",
      tags: ["AI Files"],
    })
    .input(
      listAIFileChunksRequest
        .pick({ id: true })
        .extend({ workspaceId: listAIFilesRequest.shape.workspaceId }),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(publicAIFileResource)
    .handler(async ({ input }) => {
      const file = await aiFileService.findWithProcessing({
        where: { id: input.id, workspaceId: input.workspaceId },
      })
      if (!file) {
        throw notFoundException("AI file not found")
      }
      return file
    }),
}
