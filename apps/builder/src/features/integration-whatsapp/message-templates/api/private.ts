import { getMessageTemplates } from "@/features/integration-whatsapp/message-templates/queries"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  listMessageTemplatesInputSchema,
  listWhatsappMessageTemplatesResponse,
} from "../schema/query"

export const privateAPIs = {
  listWhatsappMessageTemplates: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/channels/{id}/whatsapp-templates",
      summary: "List whatsapp templates",
      tags: ["Broadcasts"],
    })
    .input(listMessageTemplatesInputSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listWhatsappMessageTemplatesResponse)
    .handler(async ({ input }) => {
      const data = await getMessageTemplates(input)

      return data
    }),
}

export default privateAPIs
