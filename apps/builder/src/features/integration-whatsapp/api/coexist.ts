import { integrationWhatsappService } from "@chatbotx.io/business"
import {
  setCoexistRequestSchema,
  setCoexistResponseSchema,
} from "@/features/channel-connect/schema/coexist"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { triggerSync } from "../lib/coexist-trigger-sync"

export const integrationWhatsappCoexistAPIs = {
  setCoexistWhatsappAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/integrations/whatsapp/{integrationId}/coexist",
      summary: "Enable or disable WhatsApp coexist sync",
      tags: ["Integrations"],
    })
    .input(setCoexistRequestSchema)
    .output(setCoexistResponseSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) =>
      integrationWhatsappService.setCoexist({
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
        enabled: input.enabled,
        aiReadsSyncedHistory: input.aiReadsSyncedHistory,
        triggerSync,
      }),
    ),
}
