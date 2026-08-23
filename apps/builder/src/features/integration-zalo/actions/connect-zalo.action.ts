import {
  connectChannelIntegration,
  tagSyncService,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db } from "@chatbotx.io/database/client"
import {
  channelTypes,
  type ZaloCredential,
} from "@chatbotx.io/database/partials"
import { integrationZaloModel } from "@chatbotx.io/database/schema"
import type { ZaloAuthValue } from "@chatbotx.io/integration-zalo"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { redirect } from "next/navigation"
import { integrations } from "@/integration"

export async function connectZaloHandler({
  zaloSettings,
  workspaceId,
  req,
  redirectUrl,
}: {
  zaloSettings: ZaloCredential
  workspaceId: string
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
  try {
    await db.transaction(async (tx) => {
      await connectChannelIntegration({
        tx,
        ownerId,
        inboxData: {
          workspaceId,
          name: authValue.metadata.oaName,
          channel: "zalo",
          sourceId: authValue.oaId,
        },
        insertIntegration: async (inboxId, wasCreated) => {
          if (!wasCreated) {
            redirect(
              `/space/${workspaceId}/settings/channels?channel=zalo&error=duplicated`,
            )
          }
          const [row] = await tx
            .insert(integrationZaloModel)
            .values({
              inboxId,
              workspaceId,
              oaId: authValue.oaId,
              auth: authValue,
              name: authValue.metadata.oaName,
            })
            .returning({ id: integrationZaloModel.id })
          connectedIntegrationId = row?.id
        },
      })
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
