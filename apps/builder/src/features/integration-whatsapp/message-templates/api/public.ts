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

// Deprecated — use `whatsappTemplates.list` instead. Kept for backward
// compatibility with the pre-consolidation `/v1/template-messages` path and
// `templateMessages.list` operation name; hidden from MCP/CLI tool listings.
export const templateMessagesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/template-messages",
      summary: "List template messages",
      description:
        "Deprecated — renamed to `whatsappTemplates.list` at `/v1/whatsapp/templates`; this route returns the same data, kept only for callers still on the old path.",
      deprecated: true,
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
