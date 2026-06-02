import { buildContext } from "@chatbotx.io/business"
import { findOrFail } from "@chatbotx.io/database/client"
import {
  integrationWhatsappModel,
  whatsappFlowModel,
} from "@chatbotx.io/database/schema"
import {
  type WhatsappAuthValue,
  integration as whatsappIntegration,
} from "@chatbotx.io/integration-whatsapp"
import { whatsappFlowService } from "@/features/integration-whatsapp/flows/queries"
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
      const flow = await findOrFail({
        table: whatsappFlowModel,
        where: { id: input.flowId },
        message: "Whatsapp flow not found",
      })

      const integrationWhatsapp = await findOrFail({
        table: integrationWhatsappModel,
        where: {
          id: flow.integrationWhatsappId,
          workspaceId: input.workspaceId,
        },
        message: "Whatsapp integration not found",
      })

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
