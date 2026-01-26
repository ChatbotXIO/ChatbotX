import { SdkException } from "@aha.chat/sdk"
import {
  defaultWorkerOptions,
  getRedisConnection,
  queueName,
  ScheduleJobData,
  scheduleQueue,
} from "@aha.chat/worker-config"
import { type Job, Queue, Worker } from "bullmq"
import { logger } from "../lib/logger"
import { registerSchedules } from "./handlers/register-schedules"
import { sendBroadcast } from "./handlers/send-broadcast"

if (scheduleQueue instanceof Queue) {
  registerSchedules()
    .then(() => {
      logger.info("Schedules registered")
    })
    .catch((err) => {
      logger.error("Error registering schedules", err)
    })
}

const worker = new Worker(
  queueName.schedule,
  async (job: Job<ScheduleJobData>) => {
    switch (job.data.type) {
      case ScheduleJobData.sendBroadcast:
        await sendBroadcast(job.data)
        return
      default:
        throw new SdkException("ScheduleJobAction action is not defined")
    }
  },
  {
    connection: getRedisConnection(),
    ...defaultWorkerOptions,
  },
)

worker.on("failed", (job, err) => {
  if (job) {
    logger.error(`${job.id} has failed`, err)
  }
})
