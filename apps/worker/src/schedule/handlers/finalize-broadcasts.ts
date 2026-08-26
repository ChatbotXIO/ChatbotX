import { auditService } from "@chatbotx.io/business/audit"
import { and, db, eq, isNotNull, ne, or } from "@chatbotx.io/database/client"
import { broadcastStatuses } from "@chatbotx.io/database/partials"
import {
  broadcastModel,
  contactsOnBroadcastsModel,
} from "@chatbotx.io/database/schema"
import { distributedLock } from "@chatbotx.io/redis"
import { logger } from "../../lib/logger"

const LOCK_KEY = "schedule:finalize-broadcasts"
const LOCK_TTL_SECONDS = 55
const MAX_MISSING_CONTACTS_FOR_THRESHOLD = 100
const MISSING_RATE_THRESHOLD = 0.01

export const finalizeBroadcasts = async () =>
  distributedLock.runExclusive({
    key: LOCK_KEY,
    timeoutInSeconds: LOCK_TTL_SECONDS,
    fn: async () => {
      const broadcasts = await db.query.broadcastModel.findMany({
        where: {
          status: broadcastStatuses.enum.sending,
          contactCount: { isNotNull: true },
        },
      })

      if (broadcasts.length === 0) {
        return { skipped: false, finalized: 0 }
      }

      let finalized = 0

      for (const broadcast of broadcasts) {
        const total = broadcast.contactCount
        if (total === null || total <= 0) {
          continue
        }

        const completed = await db.$count(
          contactsOnBroadcastsModel,
          and(
            eq(contactsOnBroadcastsModel.broadcastId, broadcast.id),
            or(
              isNotNull(contactsOnBroadcastsModel.deliveredAt),
              isNotNull(contactsOnBroadcastsModel.failedAt),
            ),
          ),
        )

        const missingCount = total - completed
        const missingRate = missingCount / total

        const isMissingThreshold =
          total > 0 &&
          missingCount <= MAX_MISSING_CONTACTS_FOR_THRESHOLD &&
          missingRate <= MISSING_RATE_THRESHOLD

        const isComplete = completed >= total || isMissingThreshold

        if (!isComplete) {
          continue
        }

        // A losing racer against process-broadcast-contacts.ts's own
        // sent-transition must never double-audit — gate the emit on the
        // update actually changing the row, not just on reaching this line.
        const updated = await db
          .update(broadcastModel)
          .set({ status: broadcastStatuses.enum.sent })
          .where(
            and(
              eq(broadcastModel.id, broadcast.id),
              ne(broadcastModel.status, broadcastStatuses.enum.sent),
            ),
          )
          .returning({ id: broadcastModel.id })

        if (updated.length > 0) {
          await auditService.record({
            action: "broadcast_sent",
            detail: `sent a broadcast (#${broadcast.id})`,
            workspaceId: broadcast.workspaceId,
            source: "schedule:finalizeBroadcasts",
          })
        }

        finalized++
      }

      logger.info({ finalized }, "finalizeBroadcasts completed")
      return { skipped: false, finalized }
    },
  })
