import { whatsappMessageTemplateService } from "@chatbotx.io/business"
import { possibleErrorsOnListingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  listWhatsappMessageTemplatesRequest,
  listWhatsappMessageTemplatesResponse,
} from "../schema/query"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("broadcasts")

export const whatsappTemplatesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/whatsapp/templates",
      summary: "List WhatsApp templates",
      description:
        "Returns WhatsApp message templates approved for use in broadcasts, along with their approval status.",
      tags: ["WhatsApp Templates"],
    })
    .input(
      listWhatsappMessageTemplatesRequest.omit({
        workspaceId: true,
      }),
    )
    .output(listWhatsappMessageTemplatesResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await whatsappMessageTemplateService.list({
          where: { ...input, workspaceId: context.workspace.id },
        }),
    ),
}
