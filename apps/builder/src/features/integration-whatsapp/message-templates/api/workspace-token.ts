import { workspaceTokenAuthAPI } from "@/orpc"
import { whatsappMessageTemplateService } from "../queries"
import {
  listWhatsappMessageTemplatesRequest,
  listWhatsappMessageTemplatesResponse,
} from "../schema/query"

export const whatsappMessageTemplateWorkspaceTokenAPIs = {
  listWhatsappMessageTemplatesWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/whatsapp-message-templates",
      summary: "List WhatsApp message templates",
      tags: ["Template Messages"],
    })
    .input(
      listWhatsappMessageTemplatesRequest.omit({
        workspaceId: true,
      }),
    )
    .output(listWhatsappMessageTemplatesResponse)
    .handler(
      async ({ context, input }) =>
        await whatsappMessageTemplateService.list({
          where: { ...input, workspaceId: context.workspace.id },
        }),
    ),
}

export default whatsappMessageTemplateWorkspaceTokenAPIs
