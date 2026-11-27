import { integrationWhatsappService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

// Pix with redirect changes the experience every Pix button is sent with, so
// it sits under the `integrations` scope with the rest of the number's settings.
const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("integrations")

const channelIdParam = z.object({
  id: zodBigintAsString().describe(
    "WhatsApp channel (integration) id. Get it from `whatsappChannels.list`.",
  ),
})

const paymentSettingsResource = z.object({
  pixRedirectEnabled: z
    .boolean()
    .describe(
      "Whether Pix payment-request buttons are sent with redirect (`APPSWITCH`). Turn it on only after Meta has onboarded the business; buyers whose app cannot redirect still get copy & paste.",
    ),
})

const updatePaymentSettingsRequest = channelIdParam.extend({
  pixRedirectEnabled: paymentSettingsResource.shape.pixRedirectEnabled,
})

export const whatsappPaymentPublicRouter = {
  getPaymentSettings: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/whatsapp-channels/{id}/payment-settings",
      summary: "Get WhatsApp payment settings",
      description:
        "Returns how this number sends Pix payment-request buttons. No call is made to Meta. Change it with `whatsappChannels.updatePaymentSettings`.",
      tags: ["Channels"],
    })
    .input(channelIdParam)
    .output(paymentSettingsResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const integration =
        await integrationWhatsappService.findWorkspaceIntegration({
          id: input.id,
          workspaceId: context.workspace.id,
        })
      if (!integration) {
        throw notFoundException("WhatsApp channel not found")
      }
      return { pixRedirectEnabled: integration.pixRedirectEnabled }
    }),

  updatePaymentSettings: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/whatsapp-channels/{id}/payment-settings",
      summary: "Update WhatsApp payment settings",
      description:
        "Sets whether Pix payment-request buttons are sent with redirect (`APPSWITCH`). Saved here only; Meta must already have onboarded the business for Pix with redirect. Templates keep working either way.",
      successStatus: 204,
      tags: ["Channels"],
    })
    .input(updatePaymentSettingsRequest)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await integrationWhatsappService.updatePixRedirectEnabled({
        id: input.id,
        workspaceId: context.workspace.id,
        enabled: input.pixRedirectEnabled,
      })
    }),
}
