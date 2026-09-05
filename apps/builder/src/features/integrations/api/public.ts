import { integrationService } from "@chatbotx.io/business"
import {
  paginateInMemory,
  publicListRequest,
  publicListResponse,
} from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { publicIntegrationResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("integrations")

export const integrationsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/integrations",
      summary: "List integrations",
      tags: ["Integrations"],
    })
    .input(publicListRequest)
    .output(publicListResponse(publicIntegrationResource))
    .handler(async ({ context, input }) => {
      const data = await integrationService.listByWorkspaceId(
        context.workspace.id,
      )
      return paginateInMemory(data, input)
    }),
}
