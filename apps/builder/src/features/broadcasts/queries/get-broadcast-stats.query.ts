import { query } from "@chatbotx.io/clickhouse/client"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export type BroadcastStats = {
  sent: number
  delivered: number
  seen: number
  clicked: number
  failed: number
}

type ClickHouseStatsRow = {
  event_type: string
  count: string
}

export async function getBroadcastStats(input: {
  chatbotId: string
  broadcastId: string
}): Promise<BroadcastStats> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const sql = `
    SELECT
      event_type,
      uniq(contact_id) as count
    FROM broadcast_events
    WHERE chatbot_id = {chatbotId:String}
      AND broadcast_id = {broadcastId:String}
      AND batch_id = 1
      AND event_type IN ('delivered', 'seen', 'clicked', 'failed')
    GROUP BY event_type
  `

  const rows = await query<ClickHouseStatsRow>(sql, {
    chatbotId: input.chatbotId,
    broadcastId: input.broadcastId,
  })

  const stats: BroadcastStats = {
    sent: 0,
    delivered: 0,
    seen: 0,
    clicked: 0,
    failed: 0,
  }

  for (const row of rows) {
    const count = Number.parseInt(row.count, 10)
    switch (row.event_type) {
      case "delivered":
        stats.delivered = count
        break
      case "seen":
        stats.seen = count
        break
      case "clicked":
        stats.clicked = count
        break
      case "failed":
        stats.failed = count
        break
      default:
        break
    }
  }

  stats.sent = stats.delivered + stats.failed

  return stats
}
