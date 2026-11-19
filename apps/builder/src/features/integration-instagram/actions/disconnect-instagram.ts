import {
  coexistService,
  contactScanService,
  contactSyncService,
  instagramIntegrationService,
  messengerIntegrationService,
  workspaceService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { connectionStateService } from "@chatbotx.io/business/connection"
import { notFoundException } from "@chatbotx.io/business/errors"
import { db } from "@chatbotx.io/database/client"
import { metaCapiEventRepository } from "@chatbotx.io/database/repositories"
import {
  type InstagramAuthValue,
  isRevokedTokenError,
} from "@chatbotx.io/integration-instagram"
import { isRevokedTokenError as isRevokedTokenErrorFacebook } from "@chatbotx.io/integration-instagram-facebook"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"

export const disconnectInstagram = async (ctx: {
  workspaceId: string
  integrationInstagramId: string
}) => {
  const [integrationInstagram, workspace] = await Promise.all([
    instagramIntegrationService.findByIdForWorkspace({
      id: ctx.integrationInstagramId,
      workspaceId: ctx.workspaceId,
    }),
    workspaceService.findById({ id: ctx.workspaceId }),
  ])

  if (!integrationInstagram) {
    throw notFoundException("Instagram channel not found")
  }

  const authValue = integrationInstagram.auth as InstagramAuthValue
  const isFacebook = integrationInstagram.type === "facebook"

  try {
    if (isFacebook) {
      const hasMessengerSibling =
        await messengerIntegrationService.existsForPage({
          pageId: authValue.metadata.pageId,
          clientId: authValue.clientId,
        })

      if (!hasMessengerSibling) {
        await integrations.instagramFacebook.disconnect(authValue)
      }
    } else {
      await integrations.instagram.disconnect(authValue)
    }
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
      },
      "Instagram disconnect API call failed — proceeding with local cleanup",
    )

    const isRevoked = isFacebook
      ? isRevokedTokenErrorFacebook(error)
      : isRevokedTokenError(error)

    if (!isRevoked) {
      throw error
    }
  }

  await db.transaction(async (tx) => {
    // The page's open contact-import items end and its owed history sync is
    // cancelled, so a reconnect never starts one unasked (the integration row is
    // locked first, the order a handoff takes it in).
    await contactSyncService.cancelForInbox(
      {
        workspaceId: ctx.workspaceId,
        inboxId: integrationInstagram.inboxId,
        lock: { channel: "instagram", integrationId: integrationInstagram.id },
      },
      tx,
    )

    // Both Instagram variants run coexist history (the Facebook-linked one too,
    // which a contacts import hands off to), so neither is skipped.
    await coexistService.tearDownForIntegration({
      workspaceId: ctx.workspaceId,
      integrationId: integrationInstagram.id,
      channel: "instagram",
      currentError: "Integration disconnected",
      tx,
    })

    // The contact scan supports both Instagram variants too.
    await contactScanService.cancelForIntegration({
      channel: "instagram",
      integrationId: integrationInstagram.id,
      tx,
    })
    // Polymorphic FK cleanup — stale MetaCapiEvent rows would keep occupying
    // the (workspaceId, channel, sourceKey) dedup slot after a reconnect.
    await metaCapiEventRepository.deleteByIntegration(
      {
        workspaceId: ctx.workspaceId,
        channel: "instagram",
        integrationId: integrationInstagram.id,
      },
      tx,
    )

    await instagramIntegrationService.disconnect({
      id: integrationInstagram.id,
      tx,
    })

    await connectionStateService.disconnectInbox({
      inboxId: integrationInstagram.inboxId,
      ownerId: workspace.ownerId,
      workspaceId: ctx.workspaceId,
      tx,
    })
  })

  await auditService.record({
    workspaceId: ctx.workspaceId,
    action: "disconnect",
    detail: `disconnected the Instagram channel (#${integrationInstagram.id})`,
  })
}
