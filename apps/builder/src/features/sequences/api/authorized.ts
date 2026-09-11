import { sequenceService } from "@chatbotx.io/business/sequence"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listSequencesRequest, listSequencesResponse } from "../schema/action"

export const sequencesWorkspaceAuthAPI = {
  listSequencesWorkspaceAuthAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/sequences",
      summary: "List sequences",
      tags: ["Sequences"],
    })
    .input(listSequencesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listSequencesResponse)
    .handler(async ({ input }) => await sequenceService.list(input)),
}
