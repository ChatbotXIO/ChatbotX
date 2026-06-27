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
  reconcileBroadcasts: "reconcileBroadcasts",
  finalizeBroadcasts: "finalizeBroadcasts",
  evaluateTriggers: "evaluateTriggers",
  cleanupTriggers: "cleanupTriggers",
  scanSmartDelay: "scanSmartDelay",
  syncUserQuota: "syncUserQuota",
  reconcileTenants: "reconcileTenants",
  reconcileMac: "reconcileMac",
  maintainMacPartitions: "maintainMacPartitions",
  scanCoexistRuns: "scanCoexistRuns",
  purgeCoexistStaging: "purgeCoexistStaging",
  refreshZaloTokens: "refreshZaloTokens",
} as const

export const broadcastSendJobId = (broadcastId: string) =>
  `broadcast-send-${broadcastId}`

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

export type ScheduleJobReconcileBroadcasts = {
  type: typeof ScheduleJobData.reconcileBroadcasts
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

export type ScheduleJobScanSmartDelay = {
  type: typeof ScheduleJobData.scanSmartDelay
  data: Record<string, never>
}

export type ScheduleJobSyncUserQuota = {
  type: typeof ScheduleJobData.syncUserQuota
  data: Record<string, never>
}

export type ScheduleJobReconcileTenants = {
  type: typeof ScheduleJobData.reconcileTenants
  data: Record<string, never>
}

export type ScheduleJobScanCoexistRuns = {
  type: typeof ScheduleJobData.scanCoexistRuns
  data: Record<string, never>
}

export type ScheduleJobReconcileMac = {
  type: typeof ScheduleJobData.reconcileMac
  data: Record<string, never>
}

export type ScheduleJobMaintainMacPartitions = {
  type: typeof ScheduleJobData.maintainMacPartitions
  data: Record<string, never>
}

export type ScheduleJobPurgeCoexistStaging = {
  type: typeof ScheduleJobData.purgeCoexistStaging
  data: Record<string, never>
}

export type ScheduleJobRefreshZaloTokens = {
  type: typeof ScheduleJobData.refreshZaloTokens
  data: Record<string, never>
}

export type ScheduleJobData =
  | ScheduleJobBroadcast
  | ScheduleJobEnqueueBroadcast
  | ScheduleJobPrepareBroadcast
  | ScheduleJobFinalizeBroadcasts
  | ScheduleJobReconcileBroadcasts
  | ScheduleJobEvaluateTriggers
  | ScheduleJobCleanupTriggers
  | ScheduleJobScanSmartDelay
  | ScheduleJobSyncUserQuota
  | ScheduleJobReconcileTenants
  | ScheduleJobReconcileMac
  | ScheduleJobMaintainMacPartitions
  | ScheduleJobScanCoexistRuns
  | ScheduleJobPurgeCoexistStaging
  | ScheduleJobRefreshZaloTokens

export const scheduleQueue =
  process.env.NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue<ScheduleJobData>(queueNames.enum.schedule, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
