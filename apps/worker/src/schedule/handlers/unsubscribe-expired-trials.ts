import { userQuotaService } from "@chatbotx.io/business"
import { distributedLock } from "@chatbotx.io/redis"
import {
  ScheduleJobData,
  scheduleQueue,
  teardownExpiredTrialJobId,
} from "@chatbotx.io/worker-config"
import { env } from "../../env"
import { logger } from "../../lib/logger"

const SCAN_PAGE_SIZE = 500
const GRACE_DAYS = 7
const LOCK_TTL_SECONDS = 55
// Normal traffic is a handful of expired trials per hour. A batch this large
// is far more consistent with a quota-worker bug (e.g. every user reads as
// expired) than real churn — abort instead of silently disconnecting channels
// for everyone.
const MAX_TEARDOWNS_PER_RUN = 20

export async function unsubscribeExpiredTrials(cursor?: string): Promise<void> {
  // Belt-and-braces behind the scheduler gate: trial teardown disconnects
  // every channel of an owner, and off-cloud there is no billing path to
  // recover. Guards against a shared Redis re-enqueueing the job.
  if (env.NEXT_PUBLIC_EDITION !== "cloud") {
    return
  }

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

      if (userIds.length > MAX_TEARDOWNS_PER_RUN) {
        logger.error(
          { count: userIds.length, sample: userIds.slice(0, 5) },
          "unsubscribe-expired-trials: abnormal batch size, aborting",
        )
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
