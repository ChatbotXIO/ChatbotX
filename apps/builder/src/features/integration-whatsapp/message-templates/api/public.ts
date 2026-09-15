import { whatsappMessageTemplateService } from "@chatbotx.io/business"
import { possibleErrorsOnListingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  listWhatsappMessageTemplatesRequest,
  listWhatsappMessageTemplatesResponse,
} from "../schema/query"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("broadcasts")

export const templateMessagesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/template-messages",
      summary: "List template messages",
      description:
        "Returns WhatsApp message templates approved for use in broadcasts, along with their approval status.",
      tags: ["Template Messages"],
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
