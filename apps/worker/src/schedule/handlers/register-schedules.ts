import { ScheduleJobData, scheduleQueue } from "@aha.chat/worker-config"
import { Queue } from "bullmq"

export const registerSchedules = async () => {
  if (!(scheduleQueue instanceof Queue)) {
    return
  }

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.sendBroadcast,
    {
      pattern: "* * * * *",
    },
    {
      name: ScheduleJobData.sendBroadcast,
      data: {
        type: ScheduleJobData.sendBroadcast,
        data: {
          schedulesAt: new Date(),
        },
      },
    },
  )
}
