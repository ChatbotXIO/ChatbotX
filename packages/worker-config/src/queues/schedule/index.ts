import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

export const ScheduleJobData = {
  enqueueBroadcast: "enqueueBroadcast",
  prepareBroadcast: "prepareBroadcast",
  sendBroadcast: "sendBroadcast",
  finalizeBroadcasts: "finalizeBroadcasts",
  evaluateTriggers: "evaluateTriggers",
  cleanupTriggers: "cleanupTriggers",
} as const

export type ScheduleJobBroadcast = {
  type: typeof ScheduleJobData.sendBroadcast
  data: {
    broadcastId: string
  }
}

export type ScheduleJobEnqueueBroadcast = {
  type: typeof ScheduleJobData.enqueueBroadcast
  data: {
    schedulesAt: Date
  }
}

export type ScheduleJobPrepareBroadcast = {
  type: typeof ScheduleJobData.prepareBroadcast
  data: {
    broadcastId: string
  }
}

export type ScheduleJobFinalizeBroadcasts = {
  type: typeof ScheduleJobData.finalizeBroadcasts
  data: Record<string, never>
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
  | ScheduleJobEnqueueBroadcast
  | ScheduleJobPrepareBroadcast
  | ScheduleJobFinalizeBroadcasts
  | ScheduleJobEvaluateTriggers
  | ScheduleJobCleanupTriggers

export const scheduleQueue =
  process.env.NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue<ScheduleJobData>(queueNames.enum.schedule, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
