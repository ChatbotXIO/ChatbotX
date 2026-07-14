import {
  inboxService,
  messengerIntegrationExistsForPage,
} from "@chatbotx.io/business"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
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
  const integrationInstagram = await findOrFail({
    table: integrationInstagramModel,
    where: {
      id: ctx.integrationInstagramId,
      workspaceId: ctx.workspaceId,
    },
    message: "Integration Instagram not found",
  })

  const authValue = integrationInstagram.auth as InstagramAuthValue
  const isFacebook = integrationInstagram.type === "facebook"

  try {
    if (isFacebook) {
      const hasMessengerSibling = await messengerIntegrationExistsForPage({
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
    await tx
      .delete(integrationInstagramModel)
      .where(eq(integrationInstagramModel.id, integrationInstagram.id))

    await inboxService.disconnect({
      inboxId: integrationInstagram.inboxId,
      tx,
    })
  })
}
