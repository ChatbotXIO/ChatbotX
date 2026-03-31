import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listAIFunctions } from "../queries"
import {
  listAIFunctionsRequest,
  listAIFunctionsResponse,
} from "../schema/action"

export const aiFunctionsAuthenticatedAPI = {
  listAIFunctionsAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/ai-functions",
      summary: "List AI functions",
      tags: ["AI Functions"],
    })
    .input(listAIFunctionsRequest)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listAIFunctionsResponse)
    .handler(async ({ input }) => {
      return await listAIFunctions(input)
    }),
}
