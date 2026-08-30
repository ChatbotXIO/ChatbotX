import { whatsappMessageTemplateContract } from "@chatbotx.io/api-contract/whatsapp-message-template"
import { implement, onError } from "@orpc/server"
import type { BaseContext } from "@/middlewares/context"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import { mapKnownOrpcErrors, requireTokenScope } from "@/orpc"
import { whatsappMessageTemplateService } from "../queries"

const os = implement(whatsappMessageTemplateContract)
  .$context<BaseContext>()
  .use(onError(mapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)
  .use(requireTokenScope("broadcasts"))

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
