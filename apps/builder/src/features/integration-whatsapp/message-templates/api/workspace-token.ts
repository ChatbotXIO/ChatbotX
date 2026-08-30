import { whatsappMessageTemplateContract } from "@chatbotx.io/api-contract/whatsapp-message-template"
import { implement, onError } from "@orpc/server"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import type { BaseContext } from "@/orpc"
import { logAndMapKnownOrpcErrors } from "@/orpc"
import { whatsappMessageTemplateService } from "../queries"

const os = implement(whatsappMessageTemplateContract)
  .$context<BaseContext>()
  .use(onError(logAndMapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)

export const whatsappMessageTemplateWorkspaceTokenAPIs = {
  listTemplateMessagesWorkspaceTokenAPI:
    os.listWhatsappMessageTemplatesContract.handler(
      async ({ context, input }) =>
        await whatsappMessageTemplateService.list({
          where: { ...input, workspaceId: context.workspace.id },
        }),
    ),
}

export default whatsappMessageTemplateWorkspaceTokenAPIs
