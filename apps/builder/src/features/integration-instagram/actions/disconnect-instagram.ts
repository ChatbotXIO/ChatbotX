import {
  coexistService,
  inboxService,
  messengerIntegrationService,
  workspaceService,
} from "@chatbotx.io/business"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { metaCapiEventRepository } from "@chatbotx.io/database/repositories"
import { integrationInstagramModel } from "@chatbotx.io/database/schema"
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
    findOrFail({
      table: integrationInstagramModel,
      where: {
        id: ctx.integrationInstagramId,
        workspaceId: ctx.workspaceId,
      },
      message: "Integration Instagram not found",
    }),
    workspaceService.findById({ id: ctx.workspaceId }),
  ])

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
    // Coexist only exists for the native Instagram integration; the Facebook-
    // mediated variant (type "facebook") never has coexist runs. Gate explicitly
    // so the intent is clear at the call site (mirrors workspace-lifecycle).
    if (!isFacebook) {
      await coexistService.tearDownForIntegration({
        workspaceId: ctx.workspaceId,
        integrationId: integrationInstagram.id,
        channel: "instagram",
        currentError: "Integration disconnected",
        tx,
      })
    }

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

    await tx
      .delete(integrationInstagramModel)
      .where(eq(integrationInstagramModel.id, integrationInstagram.id))

    await inboxService.disconnect({
      inboxId: integrationInstagram.inboxId,
      ownerId: workspace.ownerId,
      workspaceId: ctx.workspaceId,
      tx,
    })
  })
}
