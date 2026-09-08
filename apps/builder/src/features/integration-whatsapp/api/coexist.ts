import {
  integrationWhatsappService,
  type SetCoexistTriggerSync,
} from "@chatbotx.io/business"
import { triggerSmbAppDataSync } from "@chatbotx.io/integration-whatsapp/api/coexists"
import {
  setCoexistRequestSchema,
  setCoexistResponseSchema,
} from "@/features/channel-connect/schema/coexist"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

/**
 * Provider-facing sync trigger, built from the primitives the business
 * service hands back (accessToken/version/phoneNumberId/syncType) — the
 * builder route is the only layer allowed to depend on
 * `@chatbotx.io/integration-whatsapp`, so `setCoexist` (business) never does.
 * `triggerSmbAppDataSync` declares exactly the two fields it reads
 * (`Pick<WhatsappAuthValue, "tokens" | "version">`), so this object is passed
 * as-is, with no cast.
 */
const triggerSync: SetCoexistTriggerSync = ({
  accessToken,
  version,
  phoneNumberId,
  syncType,
}) =>
  triggerSmbAppDataSync({
    auth: { tokens: { accessToken }, version },
    phoneNumberId,
    syncType,
  })

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
