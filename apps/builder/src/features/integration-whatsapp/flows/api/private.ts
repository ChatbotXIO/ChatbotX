import { whatsappFlowService } from "@chatbotx.io/business"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { getWhatsappFlowScreens } from "../lib/whatsapp-flow-operations"
import {
  getWhatsappFlowScreensRequest,
  getWhatsappFlowScreensResponse,
  listWhatsappFlowsRequest,
  listWhatsappFlowsResponse,
} from "../schema/query"

export const whatsappFlowInternalAPIs = {
  listWhatsappFlowsInternalAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/whatsapp-flows",
      summary: "List whatsapp flows",
      tags: ["Integrations"],
    })
    .input(listWhatsappFlowsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listWhatsappFlowsResponse)
    .handler(
      async ({ input }) => await whatsappFlowService.list({ where: input }),
    ),

  getWhatsappFlowScreensInternalAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/whatsapp-flows/{flowId}/screens",
      summary: "Get whatsapp flow screens",
      tags: ["Integrations"],
    })
    .input(getWhatsappFlowScreensRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(getWhatsappFlowScreensResponse)
    .handler(async ({ input }) => {
      const screens = await getWhatsappFlowScreens({
        workspaceId: input.workspaceId,
        flowId: input.flowId,
      })

      return { screens }
    }),
}
