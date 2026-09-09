import {
  buildContext,
  integrationWhatsappService,
  whatsappFlowService,
} from "@chatbotx.io/business"
import {
  type WhatsappAuthValue,
  integration as whatsappIntegration,
} from "@chatbotx.io/integration-whatsapp"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
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
      const flow = await whatsappFlowService.findByIdUnscoped(input.flowId)

      const integrationWhatsapp =
        await integrationWhatsappService.findByIdForWorkspace({
          id: flow.integrationWhatsappId,
          workspaceId: input.workspaceId,
        })
      if (!integrationWhatsapp) {
        throw new Error("Whatsapp integration not found")
      }

      const ctx = await buildContext({
        workspaceId: input.workspaceId,
        integrationType: "whatsapp",
        integration: {
          ...integrationWhatsapp,
          auth: integrationWhatsapp.auth as WhatsappAuthValue,
        },
      })

      const screens = await whatsappIntegration.runAction("getFlowAssets", {
        ctx,
        params: { flowSourceId: flow.sourceId },
      })

      return { screens }
    }),
}
