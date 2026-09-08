import {
  tagSyncService,
  workspaceService,
  zaloIntegrationService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db } from "@chatbotx.io/database/client"
import {
  channelTypes,
  type ZaloCredential,
} from "@chatbotx.io/database/partials"
import type { ZaloAuthValue } from "@chatbotx.io/integration-zalo"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { redirect } from "next/navigation"
import { integrations } from "@/integration"
import { getGuestClientIp } from "@/lib/rate-limit/guest-rate-limit"

export async function connectZaloHandler({
  zaloSettings,
  workspaceId,
  userId,
  req,
  redirectUrl,
}: {
  zaloSettings: ZaloCredential
  workspaceId: string
  userId: string
  req: Request
  redirectUrl: string
}) {
  const authValue = (await integrations.zalo.handleRequest({
    config: {
      ...zaloSettings,
      // Must match the redirect_uri used at authorize time — the tenant's
      // custom domain for a tenant-owned credential, else the broker. See
      // `libs/zalo.ts` and `oauth-referer.ts`.
      redirectUrl,
      stateParams: { workspaceId },
    },
    req,
  })) as ZaloAuthValue

  const { ownerId } = await workspaceService.findById({ id: workspaceId })

  let connectedIntegrationId: string | undefined
  let channelWasCreated = false
  let wasDuplicate = false
  try {
    await db.transaction(async (tx) => {
      const { integrationId, wasCreated } =
        await zaloIntegrationService.connect({
          tx,
          ownerId,
          workspaceId,
          oaId: authValue.oaId,
          oaName: authValue.metadata.oaName,
          auth: authValue,
        })
      connectedIntegrationId = integrationId
      channelWasCreated = wasCreated
      wasDuplicate = !integrationId
    })
  } catch (error) {
    if (
      error instanceof ChatbotXException &&
      error.code === "channelDuplicated"
    ) {
      redirect(
        `/space/${workspaceId}/settings/channels?channel=zalo&error=duplicated`,
      )
    }
    throw error
  }

  if (wasDuplicate) {
    redirect(
      `/space/${workspaceId}/settings/channels?channel=zalo&error=duplicated`,
    )
  }

  if (channelWasCreated) {
    await auditService.record({
      userId,
      workspaceId,
      action: "connect",
      detail: `connected a new Zalo channel (#${connectedIntegrationId})`,
      ipAddress: getGuestClientIp(req.headers),
      userAgent: req.headers.get("user-agent") ?? undefined,
    })
  }

  await invalidateCacheByTags([`workspaces:${workspaceId}#zalos`])

  // Import any tags already on the OA into local tags + mappings.
  if (connectedIntegrationId) {
    await tagSyncService.enqueueChannelScan({
      workspaceId,
      channelType: channelTypes.enum.zalo,
      integrationId: connectedIntegrationId,
    })
  }
}
