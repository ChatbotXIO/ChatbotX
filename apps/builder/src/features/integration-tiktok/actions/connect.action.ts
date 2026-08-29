import {
  connectChannelIntegration,
  workspaceService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db } from "@chatbotx.io/database/client"
import type { TiktokCredential } from "@chatbotx.io/database/partials"
import { integrationTiktokModel } from "@chatbotx.io/database/schema"
import type { TiktokAuthValue } from "@chatbotx.io/integration-tiktok"
import { createId } from "@chatbotx.io/utils"
import { redirect } from "next/navigation"
import { integrations } from "@/integration"
import { getGuestClientIp } from "@/lib/rate-limit/guest-rate-limit"

export async function connectTiktokHandler({
  tiktokSettings,
  workspaceId,
  userId,
  req,
  redirectUrl,
}: {
  tiktokSettings: TiktokCredential
  workspaceId: string
  userId: string
  req: Request
  redirectUrl: string
}) {
  const authValue = (await integrations.tiktok.handleRequest?.({
    config: {
      ...tiktokSettings,
      redirectUrl,
    },
    req,
  })) as TiktokAuthValue

  const openId = authValue.metadata.openId
  const displayName = authValue.metadata.displayName

  const { ownerId } = await workspaceService.findById({ id: workspaceId })
  const integrationId = createId()

  try {
    const { wasCreated, integration } = await db.transaction(async (tx) =>
      connectChannelIntegration({
        tx,
        ownerId,
        inboxData: {
          workspaceId,
          name: displayName,
          channel: "tiktok",
          sourceId: authValue.metadata.username,
        },
        insertIntegration: async (inboxId) => {
          const [integration] = await tx
            .insert(integrationTiktokModel)
            .values({
              id: integrationId,
              inboxId,
              workspaceId,
              openId,
              name: displayName,
              auth: authValue,
            })
            .onConflictDoUpdate({
              target: [integrationTiktokModel.openId],
              set: {
                auth: authValue,
                name: displayName,
                tokenRefreshError: null,
              },
            })
            .returning({ id: integrationTiktokModel.id })

          return integration
        },
      }),
    )

    if (!integration) {
      return
    }

    if (wasCreated) {
      await auditService.record({
        userId,
        workspaceId,
        action: "connect",
        detail: `connected a new TikTok channel (#${integration.id})`,
        ipAddress: getGuestClientIp(req.headers),
        userAgent: req.headers.get("user-agent") ?? undefined,
      })
    } else {
      await auditService.record({
        userId,
        workspaceId,
        action: "update",
        detail: `reconnected the TikTok channel (#${integration.id})`,
        ipAddress: getGuestClientIp(req.headers),
        userAgent: req.headers.get("user-agent") ?? undefined,
      })
    }
  } catch (error) {
    if (
      error instanceof ChatbotXException &&
      error.code === "channelDuplicated"
    ) {
      redirect(
        `/space/${workspaceId}/settings/channels?channel=tiktok&error=duplicated`,
      )
    }
    throw error
  }
}
