import { externalWebhookContract } from "@chatbotx.io/api-contract/external-webhook"
import { externalWebhookService } from "@chatbotx.io/business"
import { implement, onError } from "@orpc/server"
import type { BaseContext } from "@/middlewares/context"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import { mapKnownOrpcErrors, requireTokenScope } from "@/orpc"

const os = implement(externalWebhookContract)
  .$context<BaseContext>()
  .use(onError(mapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)
  .use(requireTokenScope("integrations"))

const listExternalWebhooksWorkspaceTokenAPI =
  os.listExternalWebhooksContract.handler(async ({ context }) => {
    const data = await externalWebhookService.listByWorkspaceId(
      context.workspace.id,
    )
    return { data }
  })

const createExternalWebhookWorkspaceTokenAPI =
  os.createExternalWebhookContract.handler(
    async ({ context, input }) =>
      await externalWebhookService.register({
        workspaceId: context.workspace.id,
        provider: input.provider,
        event: input.event,
        url: input.url,
      }),
  )

const deleteExternalWebhookWorkspaceTokenAPI =
  os.deleteExternalWebhookContract.handler(async ({ context, input }) => {
    await externalWebhookService.unregister({
      workspaceId: context.workspace.id,
      id: input.id,
    })
  })

export const externalWebhooksWorkspaceTokenAPIs = {
  listExternalWebhooksWorkspaceTokenAPI,
  createExternalWebhookWorkspaceTokenAPI,
  deleteExternalWebhookWorkspaceTokenAPI,
}

export default externalWebhooksWorkspaceTokenAPIs
