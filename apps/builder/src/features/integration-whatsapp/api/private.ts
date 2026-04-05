import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listIntegrationWhatsapps } from "../queries"
import { listIntegrationWhatsappsResponse } from "../schemas/query"

export const privateAPIs = {
  listIntegrationWhatsapp: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/integrations/whatsapp",
      summary: "List whatsapp integration",
      tags: ["Integrations"],
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listIntegrationWhatsappsResponse)
    .handler(async ({ input }) => {
      const { workspaceId, ...rest } = input
      const { data } = await listIntegrationWhatsapps({ ...rest, workspaceId })

      return data
    }),
}

export default privateAPIs
