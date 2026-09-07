import {
  deleteMessengerIntegrationWithCleanup,
  instagramIntegrationService,
  messengerIntegrationService,
  workspaceService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import {
  isRevokedTokenError,
  type MessengerAuthValue,
} from "@chatbotx.io/integration-messenger"
import { subscribePageToAppWebhook } from "@chatbotx.io/integration-messenger/apis/page"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"

export const disconnectMessenger = async (ctx: {
  workspaceId: string
  id: string
}) => {
  const [integrationMessenger, workspace] = await Promise.all([
    messengerIntegrationService.findByIdForWorkspace({
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    }),
    workspaceService.findById({ id: ctx.workspaceId }),
  ])

  if (!integrationMessenger) {
    throw new Error("Integration Messenger not found")
  }

  const authValue = integrationMessenger.auth as MessengerAuthValue

  const hasSharedInstagramIntegration =
    await instagramIntegrationService.existsForPage({
      pageId: authValue.metadata.pageId,
      clientId: authValue.clientId,
    })

  if (hasSharedInstagramIntegration) {
    try {
      await subscribePageToAppWebhook({
        pageId: authValue.metadata.pageId,
        accessToken: authValue.tokens.accessToken,
        version: authValue.metadata.version,
        subscribedFields: "general_info",
      })
    } catch (error) {
      logger.warn(
        {
          err: error instanceof Error ? error.message : String(error),
          pageId: authValue.metadata.pageId,
        },
        "Failed to preserve shared Messenger webhook subscription during disconnect",
      )
    }
  } else {
    try {
      await integrations.messenger.disconnect(authValue)
    } catch (error) {
      if (!isRevokedTokenError(error)) {
        throw error
      }
    }
  }

  await deleteMessengerIntegrationWithCleanup({
    workspaceId: ctx.workspaceId,
    id: integrationMessenger.id,
    inboxId: integrationMessenger.inboxId,
    ownerId: workspace.ownerId,
  })

  await auditService.record({
    workspaceId: ctx.workspaceId,
    action: "disconnect",
    detail: `disconnected the Messenger channel (#${integrationMessenger.id})`,
  })
}
