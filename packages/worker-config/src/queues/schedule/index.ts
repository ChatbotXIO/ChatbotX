import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueName } from "../../lib/types"

export const ScheduleJobData = {
  sendBroadcast: "sendBroadcast",
} as const

export type ScheduleJobBroadcast = {
  type: typeof ScheduleJobData.sendBroadcast
  data: {
    schedulesAt: Date
  }
}

export type ScheduleJobData = ScheduleJobBroadcast

export const scheduleQueue =
  process.env.NEXT_PHASE !== "phase-production-build"
    ? new Queue<ScheduleJobData>(queueName.schedule, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
    : fakeQueue
