import { messagingAdsConnectionService } from "@chatbotx.io/business"
import type { MessagingAdChannel } from "@chatbotx.io/database/partials"
import type { MessagingAdsConnectionModel } from "@chatbotx.io/database/types"
import { logger } from "@/lib/log"

/**
 * Per-channel accessor for the one integration FK column a connection row
 * actually populates — `messagingAdsConnectionModel`'s check constraint
 * guarantees exactly one of `integrationWhatsappId` /
 * `integrationMessengerId` / `integrationInstagramId` is non-null for a
 * given `channel` (`packages/database/src/schema/messaging-ads-connection.ts`).
 */
const INTEGRATION_ID_OF: Record<
  MessagingAdChannel,
  (connection: MessagingAdsConnectionModel) => string | null
> = {
  whatsapp: (connection) => connection.integrationWhatsappId,
  messenger: (connection) => connection.integrationMessengerId,
  instagram: (connection) => connection.integrationInstagramId,
}

/**
 * Integration ids for one channel that already have an `active`
 * messaging-ads connection — feeds `selectMessagingAdsToolIntegration`'s
 * "prefer an already-connected integration" fallback, so returning to the
 * tool page (no `?integration=`) lands on an integration that is actually
 * connected rather than list order.
 *
 * Fail-soft exactly like `checkMessagingAdsConnectionState`
 * (`features/ads-campaign/queries/index.ts`): a resolution failure must
 * degrade to "no active integration known" (the tool page then falls back
 * to the first integration) rather than take down the whole tool page.
 */
export async function listActiveMessagingAdsIntegrationIds(input: {
  workspaceId: string
  channel: MessagingAdChannel
}): Promise<string[]> {
  try {
    const connections =
      await messagingAdsConnectionService.listForChannel(input)
    const integrationIdOf = INTEGRATION_ID_OF[input.channel]
    return connections
      .filter((connection) => connection.status === "active")
      .map(integrationIdOf)
      .filter(
        (integrationId): integrationId is string => integrationId !== null,
      )
  } catch (error) {
    logger.error(
      {
        err: error,
        channel: input.channel,
        workspaceId: input.workspaceId,
      },
      "Failed to resolve active messaging-ads integration ids; degrading to none",
    )
    return []
  }
}
