import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listSequences } from "../queries"
import { listSequencesRequest, listSequencesResponse } from "../schema"

export const sequencesChatbotAuthAPI = {
  listSequencesChatbotAuthAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/sequences",
      summary: "List sequences",
      tags: ["Sequences"],
    })
    .input(listSequencesRequest)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listSequencesResponse)
    .handler(async ({ input }) => {
      return await listSequences(input)
    }),
}
