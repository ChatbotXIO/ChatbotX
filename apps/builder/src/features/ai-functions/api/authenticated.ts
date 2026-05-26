import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listAIFunctions } from "../queries"
import {
  listAIFunctionsRequest,
  listAIFunctionsResponse,
} from "../schemas/action"

export const aiFunctionsAuthenticatedAPI = {
  listAIFunctionsAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ai-functions",
      summary: "Listar funções de IA",
      tags: ["Funções de IA"],
    })
    .input(listAIFunctionsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listAIFunctionsResponse)
    .handler(async ({ input }) => await listAIFunctions(input)),
}
