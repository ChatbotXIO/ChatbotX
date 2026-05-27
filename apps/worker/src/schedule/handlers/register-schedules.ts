import { ScheduleJobData, scheduleQueue } from "@chatbotx.io/worker-config"
import { Queue } from "bullmq"
import { env } from "../../env"

export const registerSchedules = async () => {
  if (!(scheduleQueue instanceof Queue)) {
    return
  }

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.enqueueBroadcast,
    {
      pattern: "* * * * *",
    },
    {
      name: ScheduleJobData.enqueueBroadcast,
      data: {
        type: ScheduleJobData.enqueueBroadcast,
        data: {
          schedulesAt: new Date(),
        },
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.finalizeBroadcasts,
    {
      pattern: "* * * * *",
    },
    {
      name: ScheduleJobData.finalizeBroadcasts,
      data: {
        type: ScheduleJobData.finalizeBroadcasts,
        data: {},
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.evaluateTriggers,
    {
      pattern: "* * * * *",
      // every: 5000,
    },
    {
      name: ScheduleJobData.evaluateTriggers,
      data: {
        type: ScheduleJobData.evaluateTriggers,
        data: {},
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.scanSmartDelay,
    {
      pattern: "*/5 * * * *",
    },
    {
      name: ScheduleJobData.scanSmartDelay,
      data: {
        type: ScheduleJobData.scanSmartDelay,
        data: {},
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.syncUserQuota,
    { every: env.QUOTA_SYNC_INTERVAL_SECONDS * 1000 },
    {
      name: ScheduleJobData.syncUserQuota,
      data: { type: ScheduleJobData.syncUserQuota, data: {} },
    },
  )
}
