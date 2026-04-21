import { and, count, db, eq, isNotNull } from "@chatbotx.io/database/client"
import { contactsOnBroadcastsModel } from "@chatbotx.io/database/schema"
import type { BroadcastStats } from "../../schemas/broadcast-stats"
import { BaseRepository } from "./base.repository"

export class BroadcastStatsPgRepository extends BaseRepository {
  async getStats(input: {
    workspaceId: string
    broadcastId: string
  }): Promise<BroadcastStats> {
    const { broadcastId } = input
    const t = contactsOnBroadcastsModel

    const [deliveredResult, seenResult, clickedResult, failedResult] =
      await Promise.all([
        db
          .select({ count: count() })
          .from(t)
          .where(and(eq(t.broadcastId, broadcastId), isNotNull(t.deliveredAt))),
        db
          .select({ count: count() })
          .from(t)
          .where(and(eq(t.broadcastId, broadcastId), isNotNull(t.seenAt))),
        db
          .select({ count: count() })
          .from(t)
          .where(and(eq(t.broadcastId, broadcastId), isNotNull(t.clickedAt))),
        db
          .select({ count: count() })
          .from(t)
          .where(and(eq(t.broadcastId, broadcastId), isNotNull(t.failedAt))),
      ])

    const delivered = deliveredResult[0]?.count ?? 0
    const seen = seenResult[0]?.count ?? 0
    const clicked = clickedResult[0]?.count ?? 0
    const failed = failedResult[0]?.count ?? 0

    return {
      "message:sent": delivered + failed,
      "message:delivered": delivered,
      "message:seen": seen,
      "flow:clicked": clicked,
      "message:failed": failed,
    }
  }
}

export const broadcastStatsPgRepository = new BroadcastStatsPgRepository()
