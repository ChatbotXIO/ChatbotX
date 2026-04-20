import { ScheduleJobData, scheduleQueue } from "@chatbotx.io/worker-config"
import { Queue } from "bullmq"

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
}
