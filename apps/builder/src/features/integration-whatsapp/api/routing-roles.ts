import { integrationWhatsappService } from "@chatbotx.io/business"
import { routingRolesSnapshotSchema } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { syncWhatsappRoutingRoles } from "../lib/routing-roles"

const integrationInput = z.object({
  workspaceId: zodBigintAsString(),
  integrationWhatsappId: zodBigintAsString(),
})

/**
 * Builder side of the WhatsApp routing roles (`whatsappChannels.getRoutingRoles`
 * / `syncRoutingRoles` are the public twins; all call the same service/lib).
 */
export const integrationWhatsappRoutingRolesAPIs = {
  getWhatsappRoutingRolesAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/integrations/whatsapp/{integrationWhatsappId}/routing-roles",
      summary: "Get WhatsApp routing roles",
      tags: ["Integrations"],
    })
    .input(integrationInput)
    .output(routingRolesSnapshotSchema.nullable())
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(
      async ({ input }) =>
        await integrationWhatsappService.findRoutingRoles({
          id: input.integrationWhatsappId,
          workspaceId: input.workspaceId,
        }),
    ),

  syncWhatsappRoutingRolesAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/integrations/whatsapp/{integrationWhatsappId}/routing-roles/sync",
      summary: "Sync WhatsApp routing roles",
      tags: ["Integrations"],
    })
    .input(integrationInput)
    .output(routingRolesSnapshotSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(
      async ({ input }) =>
        await syncWhatsappRoutingRoles({
          workspaceId: input.workspaceId,
          integrationWhatsappId: input.integrationWhatsappId,
        }),
    ),

  /** The roles of the number behind an inbox, for the conversation composer. */
  getWhatsappRoutingRolesByInboxAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/inboxes/{inboxId}/whatsapp-routing-roles",
      summary: "Get WhatsApp routing roles of an inbox",
      tags: ["Integrations"],
    })
    .input(
      z.object({
        workspaceId: zodBigintAsString(),
        inboxId: zodBigintAsString(),
      }),
    )
    .output(routingRolesSnapshotSchema.nullable())
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(
      async ({ input }) =>
        await integrationWhatsappService.findRoutingRolesByInbox({
          inboxId: input.inboxId,
          workspaceId: input.workspaceId,
        }),
    ),
}
