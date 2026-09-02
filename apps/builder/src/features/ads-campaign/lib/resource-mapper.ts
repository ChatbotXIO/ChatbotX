import type { MessagingAdOperationModel } from "@chatbotx.io/database/types"
import type { MessagingAdOperationResource } from "../schema/resource"

export function toMessagingAdOperationResource(
  row: MessagingAdOperationModel & { effectiveStatus: string | null },
): MessagingAdOperationResource {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    channel: row.channel,
    adAccountId: row.adAccountId,
    name: row.name,
    createState: row.createState,
    publishState: row.publishState,
    metaCampaignId: row.metaCampaignId,
    metaAdSetId: row.metaAdSetId,
    metaAdCreativeId: row.metaAdCreativeId,
    metaAdId: row.metaAdId,
    lastError: row.lastError,
    cleanupError: row.cleanupError,
    effectiveStatus: row.effectiveStatus,
    createdAt: row.createdAt,
  }
}
