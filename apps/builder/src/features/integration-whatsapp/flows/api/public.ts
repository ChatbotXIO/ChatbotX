import {
  integrationWhatsappService,
  whatsappFlowService,
} from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  getWhatsappFlowScreens,
  syncWhatsappFlows,
} from "../lib/whatsapp-flow-operations"
import {
  getWhatsappFlowScreensResponse,
  listWhatsappFlowsRequest,
} from "../schema/query"
import { whatsappFlowResource } from "../schema/resource"

// WhatsApp Flows are what a template button opens, so they share the
// templates' scope.
const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("broadcasts")

const publicFlowResource = whatsappFlowResource.omit({
  integrationWhatsapp: true,
})

export const whatsappFlowsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/whatsapp/flows",
      summary: "List WhatsApp Flows",
      description:
        "Lists the WhatsApp Flows synced from Meta for this workspace's numbers, with their status and validation errors. Filter by `integrationWhatsappId` or `inboxId`. Run `whatsappFlows.sync` first if a Flow just created on Meta is missing.",
      tags: ["WhatsApp Flows"],
    })
    .input(listWhatsappFlowsRequest.omit({ workspaceId: true }))
    .output(z.array(publicFlowResource))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const flows = await whatsappFlowService.list({
        where: { ...input, workspaceId: context.workspace.id },
      })
      return flows.map((flow) => publicFlowResource.parse(flow))
    }),

  getScreens: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/whatsapp/flows/{flowId}/screens",
      summary: "Get WhatsApp Flow screens",
      description:
        "Returns the screens of a Flow and the fields each one outputs, read from Meta, so you can map them when sending a template that opens the Flow. Find the id with `whatsappFlows.list`.",
      tags: ["WhatsApp Flows"],
    })
    .input(
      z.object({
        flowId: zodBigintAsString().describe(
          "Flow id. Get it from `whatsappFlows.list`.",
        ),
      }),
    )
    .output(getWhatsappFlowScreensResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => ({
      screens: await getWhatsappFlowScreens({
        workspaceId: context.workspace.id,
        flowId: input.flowId,
      }),
    })),

  sync: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/whatsapp-channels/{id}/sync-flows",
      summary: "Sync WhatsApp Flows",
      description:
        "Pulls the number's Flows and their status from Meta into this workspace.",
      successStatus: 204,
      tags: ["WhatsApp Flows"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "WhatsApp channel (integration) id. Get it from `whatsappChannels.list`.",
        ),
      }),
    )
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const integrationWhatsapp =
        await integrationWhatsappService.findByIdForWorkspace({
          id: input.id,
          workspaceId,
        })
      if (!integrationWhatsapp) {
        throw notFoundException("WhatsApp channel not found")
      }
      await syncWhatsappFlows({ workspaceId, integrationWhatsapp })
    }),
}
