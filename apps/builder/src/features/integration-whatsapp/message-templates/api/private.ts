import { integrationMetaCatalogService } from "@chatbotx.io/business"
import { whatsappMessageTemplateService } from "@/features/integration-whatsapp/message-templates/queries"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  listWhatsappMessageTemplatesRequest,
  listWhatsappMessageTemplatesResponse,
  searchMetaCatalogProductsRequest,
  searchMetaCatalogProductsResponse,
} from "../schema/query"

export const whatsappMessageTemplateInternalAPIs = {
  listWhatsappMessageTemplatesInternalAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/whatsapp-message-templates",
      summary: "List whatsapp message templates",
      tags: ["Integrations"],
    })
    .input(listWhatsappMessageTemplatesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listWhatsappMessageTemplatesResponse)
    .handler(
      async ({ input }) =>
        await whatsappMessageTemplateService.list({ where: input }),
    ),

  searchMetaCatalogProductsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/whatsapp-message-templates/meta-catalog-products",
      summary: "Search Meta Catalog products for template button params",
      tags: ["Integrations"],
    })
    .input(searchMetaCatalogProductsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(searchMetaCatalogProductsResponse)
    .handler(
      async ({ input }) =>
        await integrationMetaCatalogService.searchProductsForSend(input),
    ),
}
