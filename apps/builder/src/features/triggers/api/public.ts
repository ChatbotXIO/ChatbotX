import { triggerService } from "@chatbotx.io/business"
import z from "zod"
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
    .output(z.object({ data: z.array(triggerResource) }))
    .handler(async ({ context }) => {
      const triggers = await triggerService.listByWorkspaceId(
        context.workspace.id,
      )
      return {
        data: triggers.map((trigger) => ({
          ...trigger,
          conditions: [],
          actions: [],
        })),
      }
    }),
}
