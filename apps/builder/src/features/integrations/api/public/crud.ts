import { integrationService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
} from "@/lib/orpc/orpc-error-helper"
import {
  paginateInMemory,
  publicListRequest,
  publicListResponse,
} from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  getIntegrationRequest,
  listTokenRefreshErrorsResponse,
} from "../../schema/public"
import { publicIntegrationResource } from "../../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("integrations")

export const integrationsCrudPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/integrations",
      summary: "List integrations",
      tags: ["Integrations"],
    })
    .input(publicListRequest)
    .output(publicListResponse(publicIntegrationResource))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await integrationService.listByWorkspaceId(
        context.workspace.id,
      )
      return paginateInMemory(data, input)
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/integrations/{id}",
      summary: "Get an integration",
      tags: ["Integrations"],
    })
    .input(getIntegrationRequest)
    .output(publicIntegrationResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const integration = await integrationService.findByIdForWorkspace({
        id: input.id,
        workspaceId: context.workspace.id,
      })
      if (!integration) {
        throw notFoundException("Integration not found")
      }
      return integration
    }),

  tokenErrors: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/integrations/status/token-errors",
      summary: "List channel integrations with a failed token refresh",
      description:
        "Channel integrations whose daily automatic token-refresh last failed — a signal the channel needs a manual reconnect before it silently stops sending or receiving messages.",
      tags: ["Integrations"],
    })
    .output(listTokenRefreshErrorsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context }) => {
      const data = await integrationService.findTokenRefreshErrorsByWorkspaceId(
        context.workspace.id,
      )
      return { data }
    }),
}
