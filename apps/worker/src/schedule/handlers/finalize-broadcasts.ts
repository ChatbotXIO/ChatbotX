import { and, db, eq, isNotNull, or } from "@chatbotx.io/database/client"
import { broadcastStatuses } from "@chatbotx.io/database/partials"
import {
  broadcastModel,
  contactsOnBroadcastsModel,
} from "@chatbotx.io/database/schema"
import { distributedLock } from "@chatbotx.io/redis"
import { logger } from "../../lib/logger"

const LOCK_KEY = "schedule:finalize-broadcasts"
const LOCK_TTL_SECONDS = 55
const MIN_CONTACTS_FOR_THRESHOLD = 100
const MISSING_RATE_THRESHOLD = 1

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
          missingCount <= Math.min(missingCount, MIN_CONTACTS_FOR_THRESHOLD) &&
          missingRate <= MISSING_RATE_THRESHOLD

        const isComplete = completed >= total || isMissingThreshold

        if (!isComplete) {
          continue
        }

        await db
          .update(broadcastModel)
          .set({ status: broadcastStatuses.enum.sent })
          .where(eq(broadcastModel.id, broadcast.id))

        finalized++
      }

      logger.info({ finalized }, "finalizeBroadcasts completed")
      return { skipped: false, finalized }
    },
  })
