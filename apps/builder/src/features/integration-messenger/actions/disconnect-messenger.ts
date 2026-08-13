import {
  coexistService,
  inboxService,
  instagramIntegrationService,
  workspaceService,
} from "@chatbotx.io/business"
import { and, db, eq, findOrFail } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import { metaCapiEventRepository } from "@chatbotx.io/database/repositories"
import {
  integrationMessengerModel,
  tagChannelModel,
} from "@chatbotx.io/database/schema"
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
    findOrFail({
      table: integrationMessengerModel,
      where: {
        id: ctx.id,
        workspaceId: ctx.workspaceId,
      },
      message: "Integration Messenger not found",
    }),
    workspaceService.findById({ id: ctx.workspaceId }),
  ])

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

  await db.transaction(async (tx) => {
    await coexistService.tearDownForIntegration({
      workspaceId: ctx.workspaceId,
      integrationId: integrationMessenger.id,
      channel: "messenger",
      currentError: "Integration disconnected",
      tx,
    })

    // Polymorphic FK cleanup — no DB-level cascade for TagChannel.integrationId
    await tx
      .delete(tagChannelModel)
      .where(
        and(
          eq(tagChannelModel.channelType, channelTypes.enum.messenger),
          eq(tagChannelModel.integrationId, integrationMessenger.id),
        ),
      )

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

    await tx
      .delete(integrationMessengerModel)
      .where(eq(integrationMessengerModel.id, integrationMessenger.id))

    await inboxService.disconnect({
      inboxId: integrationMessenger.inboxId,
      ownerId: workspace.ownerId,
      workspaceId: ctx.workspaceId,
      tx,
    })
  })
}
