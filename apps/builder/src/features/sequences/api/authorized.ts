import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listSequences } from "../queries"
import { listSequencesRequest, listSequencesResponse } from "../schema/action"

export const sequencesChatbotAuthAPI = {
  listSequencesChatbotAuthAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/sequences",
      summary: "List sequences",
      tags: ["Sequences"],
    })
    .input(listSequencesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listSequencesResponse)
    .handler(async ({ input }) => {
      return await listSequences(input)
    }),
}
