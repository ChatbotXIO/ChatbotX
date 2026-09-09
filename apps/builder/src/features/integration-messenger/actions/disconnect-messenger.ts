import {
  coexistService,
  inboxService,
  instagramIntegrationService,
  messengerIntegrationService,
  workspaceService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { db } from "@chatbotx.io/database/client"
import { metaCapiEventRepository } from "@chatbotx.io/database/repositories"
import {
  isDisconnectSafeError,
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
      // Only non-retryable Graph errors (app already uninstalled, page gone,
      // token revoked, permissions lost) may skip the remote unsubscribe.
      // Transient failures still surface so the user retries.
      if (!isDisconnectSafeError(error)) {
        throw error
      }
      logger.warn(
        {
          err: error instanceof Error ? error.message : String(error),
          pageId: authValue.metadata.pageId,
        },
        "Messenger page unsubscribe failed with a non-retryable Graph error — proceeding with local disconnect",
      )
    }
  }

  await db.transaction(async (tx) => {
    await coexistService.tearDownForIntegration({
      workspaceId: ctx.workspaceId,
      integrationId: integrationMessenger.id,
      channel: "messenger",
      currentError: "Integration disconnected",
      tx,
    })

    // Polymorphic FK cleanup — stale MetaCapiEvent rows would keep occupying
    // the (workspaceId, channel, sourceKey) dedup slot after a reconnect.
    await metaCapiEventRepository.deleteByIntegration(
      {
        workspaceId: ctx.workspaceId,
        channel: "messenger",
        integrationId: integrationMessenger.id,
      },
      tx,
    )

    await messengerIntegrationService.disconnect({
      id: integrationMessenger.id,
      tx,
    })

    await inboxService.disconnect({
      inboxId: integrationMessenger.inboxId,
      ownerId: workspace.ownerId,
      workspaceId: ctx.workspaceId,
      reason: "manual",
      tx,
    })
  })

  await auditService.record({
    workspaceId: ctx.workspaceId,
    action: "disconnect",
    detail: `disconnected the Messenger channel (#${integrationMessenger.id})`,
  })
}
