import { triggerService } from "@chatbotx.io/business"
import {
  paginateInMemory,
  publicListRequest,
  publicListResponse,
} from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

import { triggerResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const triggersPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/triggers",
      summary: "List triggers",
      tags: ["Triggers"],
    })
    .input(publicListRequest)
    .output(publicListResponse(triggerResource))
    .handler(async ({ context, input }) => {
      const triggers = await triggerService.listByWorkspaceId(
        context.workspace.id,
      )
      return paginateInMemory(
        triggers.map((trigger) => ({
          ...trigger,
          conditions: [],
          actions: [],
        })),
        input,
      )
    }),
}
