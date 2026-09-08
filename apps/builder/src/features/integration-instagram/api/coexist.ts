import { coexistService } from "@chatbotx.io/business"
import {
  setCoexistRequestSchema,
  setCoexistResponseSchema,
} from "@/features/channel-connect/schema/coexist"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

export const integrationInstagramCoexistAPIs = {
  setCoexistInstagramAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/integrations/instagram/{integrationId}/coexist",
      summary: "Enable or disable native Instagram coexist sync",
      tags: ["Integrations"],
    })
    .input(setCoexistRequestSchema)
    .output(setCoexistResponseSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) =>
      input.enabled
        ? coexistService.enable({
            workspaceId: input.workspaceId,
            integrationId: input.integrationId,
            channel: "instagram",
            aiReadsSyncedHistory: input.aiReadsSyncedHistory,
          })
        : coexistService.disable({
            workspaceId: input.workspaceId,
            integrationId: input.integrationId,
            channel: "instagram",
          }),
    ),
}
