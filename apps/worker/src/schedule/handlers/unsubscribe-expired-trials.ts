import { userQuotaService } from "@chatbotx.io/business"
import { distributedLock } from "@chatbotx.io/redis"
import {
  ScheduleJobData,
  scheduleQueue,
  teardownExpiredTrialJobId,
} from "@chatbotx.io/worker-config"

const SCAN_PAGE_SIZE = 500
const GRACE_DAYS = 7
const LOCK_TTL_SECONDS = 55

export async function unsubscribeExpiredTrials(cursor?: string): Promise<void> {
  await distributedLock.runExclusive({
    key: "schedule:unsubscribe-expired-trials",
    timeoutInSeconds: LOCK_TTL_SECONDS,
    fn: async () => {
      const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000)
      const { userIds, nextCursor } =
        await userQuotaService.listDueExpiredTrials({
          cutoff,
          cursor,
          limit: SCAN_PAGE_SIZE,
        })

      if (userIds.length === 0) {
        return
      }

      await scheduleQueue.addBulk(
        userIds.map((userId) => ({
          name: ScheduleJobData.teardownExpiredTrial,
          data: {
            type: ScheduleJobData.teardownExpiredTrial,
            data: { userId },
          },
          opts: {
            jobId: teardownExpiredTrialJobId(userId),
            removeOnComplete: { age: 3600 },
            removeOnFail: { age: 3600 },
          },
        })),
      )

      if (nextCursor) {
        await scheduleQueue.add(
          ScheduleJobData.unsubscribeExpiredTrials,
          {
            type: ScheduleJobData.unsubscribeExpiredTrials,
            data: { cursor: nextCursor },
          },
          {
            jobId: `unsubscribe-expired-trials-scan-${nextCursor}`,
            removeOnComplete: true,
            removeOnFail: true,
          },
        )
      }
    },
  })
}
