import {
  deleteInstagramIntegrationWithCleanup,
  instagramIntegrationService,
  messengerIntegrationService,
  workspaceService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
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
    throw new Error("Integration Instagram not found")
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

  await deleteInstagramIntegrationWithCleanup({
    workspaceId: ctx.workspaceId,
    id: integrationInstagram.id,
    inboxId: integrationInstagram.inboxId,
    ownerId: workspace.ownerId,
    isFacebook,
  })

  await auditService.record({
    workspaceId: ctx.workspaceId,
    action: "disconnect",
    detail: `disconnected the Instagram channel (#${integrationInstagram.id})`,
  })
}
