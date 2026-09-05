import { integrationService } from "@chatbotx.io/business"
import {
  createSelectSchema,
  integrationModel,
} from "@chatbotx.io/database/schema"
import z from "zod"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("integrations")

const integrationResource = createSelectSchema(integrationModel, {
  id: z.string(),
  workspaceId: z.string(),
})

export const integrationsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/integrations",
      summary: "List integrations",
      tags: ["Integrations"],
    })
    .output(z.object({ data: z.array(integrationResource) }))
    .handler(async ({ context }) => {
      const data = await integrationService.listByWorkspaceId(
        context.workspace.id,
      )
      return { data }
    }),
}
