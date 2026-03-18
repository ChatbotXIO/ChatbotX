import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueName } from "../../lib/types"

export const ScheduleJobData = {
  sendBroadcast: "sendBroadcast",
  evaluateTriggers: "evaluateTriggers",
  cleanupTriggers: "cleanupTriggers",
} as const

export type ScheduleJobBroadcast = {
  type: typeof ScheduleJobData.sendBroadcast
  data: {
    schedulesAt: Date
  }
}

export type ScheduleJobEvaluateTriggers = {
  type: typeof ScheduleJobData.evaluateTriggers
  data: Record<string, never>
}

export type ScheduleJobCleanupTriggers = {
  type: typeof ScheduleJobData.cleanupTriggers
  data: Record<string, never>
}

export type ScheduleJobData =
  | ScheduleJobBroadcast
  | ScheduleJobEvaluateTriggers
  | ScheduleJobCleanupTriggers

export const scheduleQueue =
  process.env.NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue<ScheduleJobData>(queueName.schedule, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
