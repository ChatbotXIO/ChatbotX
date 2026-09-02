import { db } from "@chatbotx.io/database/client"
import { broadcastStatuses } from "@chatbotx.io/database/partials"
import { distributedLock } from "@chatbotx.io/redis"
import {
  broadcastSendJobId,
  ScheduleJobData,
  scheduleQueue,
} from "@chatbotx.io/worker-config"

const LOCK_KEY = "schedule:reconcile-broadcasts"
const LOCK_TTL_SECONDS = 55

export const reconcileBroadcasts = async () =>
  distributedLock.runExclusive({
    key: LOCK_KEY,
    timeoutInSeconds: LOCK_TTL_SECONDS,
    fn: async () => {
      const broadcasts = await db.query.broadcastModel.findMany({
        where: {
          status: broadcastStatuses.enum.sending,
          handoffCompletedAt: { isNull: true },
          deletedAt: { isNull: true },
        },
      })

      for (const broadcast of broadcasts) {
        await scheduleQueue.add(
          ScheduleJobData.sendBroadcast,
          {
            type: ScheduleJobData.sendBroadcast,
            data: { broadcastId: broadcast.id },
          },
          {
            jobId: broadcastSendJobId(broadcast.id),
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: true,
          },
        )
      }

      return { reconciled: broadcasts.length }
    },
  })
