import { questionnaireService } from "@chatbotx.io/business"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  listQuestionnairesForFlowRequest,
  listQuestionnairesForFlowResponse,
} from "../schemas/query"

export const questionnairesAuthenticatedAPI = {
  listQuestionnairesForFlowAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/questionnaires/for-flow",
      summary: "List questionnaires for flow",
      tags: ["Questionnaires"],
    })
    .input(listQuestionnairesForFlowRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listQuestionnairesForFlowResponse)
    .handler(
      async ({ input }) => await questionnaireService.listForFlow(input),
    ),
}
