import {
  listIntegrationWhatsappsResponse,
  platformCredentialService,
} from "@chatbotx.io/business"
import { listPhoneNumbers as whatsappListPhoneNumbers } from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { DEFAULT_API_VERSION } from "@chatbotx.io/integration-whatsapp/constants"
import z from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { resolvePlatformOwnerId } from "@/lib/platform-credential-owner"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listIntegrationWhatsapps } from "../queries"
import { listPhoneNumbersRequest, listPhoneNumbersResponse } from "../schema"

export const integrationWhatsappInternalAPIs = {
  listIntegrationWhatsappInternalAPI: authorizedAPI
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

  // No workspaceAuthorizedMidddleware: the caller's workspaceId is optional
  // (the component may render before a workspace is selected), and the owner
  // is deliberately host-derived via resolvePlatformOwnerId, which reads the
  // request host and works from inside the /rpc route handler.
  listWhatsappPhoneNumbersInternalAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/whatsapp/phone-numbers/list",
      summary: "List WhatsApp phone numbers for a WABA",
      tags: ["Integrations"],
    })
    .input(
      listPhoneNumbersRequest.and(
        z.object({ workspaceId: z.string().optional() }),
      ),
    )
    .output(listPhoneNumbersResponse)
    .handler(async ({ input, context }) => {
      const ownerId = await resolvePlatformOwnerId({
        userId: context.user.id,
        workspaceId: input.workspaceId,
      })
      const credential = await platformCredentialService.resolveForOwner({
        ownerId,
        type: "whatsapp",
      })
      const version = credential?.publicConfig.version ?? DEFAULT_API_VERSION

      return await whatsappListPhoneNumbers({
        wabaId: input.wabaId,
        accessToken: input.accessToken,
        version,
      })
    }),
}
