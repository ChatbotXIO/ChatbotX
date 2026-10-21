import "server-only"

import {
  facebookMarketingMessageDeliveryService,
  facebookMarketingMessagesService,
} from "@chatbotx.io/business"
import type { FacebookMarketingMessageModel } from "@chatbotx.io/database/types"

export function listMarketingMessages(
  workspaceId: string,
): Promise<FacebookMarketingMessageModel[]> {
  return facebookMarketingMessagesService.list(workspaceId)
}

export type CampaignCounts = { sent: number; delivered: number; failed: number }

/**
 * Per-row delivery counts for the list. Lists are small, so one `getStats` per
 * row; a row whose stats cannot be read just renders without counts.
 */
export async function getMarketingMessageCounts(
  workspaceId: string,
  rows: FacebookMarketingMessageModel[],
): Promise<Record<string, CampaignCounts>> {
  const entries = await Promise.all(
    rows.map(async (row) => {
      try {
        const stats = await facebookMarketingMessageDeliveryService.getStats({
          workspaceId,
          id: row.id,
        })
        return [row.id, stats.counts] as const
      } catch {
        return null
      }
    }),
  )
  return Object.fromEntries(
    entries
      .filter((entry) => entry !== null)
      .map(([id, c]) => [
        id,
        { sent: c.sent, delivered: c.delivered, failed: c.failed },
      ]),
  )
}
