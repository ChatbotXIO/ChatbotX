import type { ChannelType } from "@chatbotx.io/database/partials"
import { Queue } from "bullmq"
import { z } from "zod"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
  isNoRedisEnv,
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
  evaluateDateTimeWebhooks: "evaluateDateTimeWebhooks",
  cleanupWebhookExecutions: "cleanupWebhookExecutions",
  scanSmartDelay: "scanSmartDelay",
  scanAppointmentReminders: "scanAppointmentReminders",
  syncUserQuota: "syncUserQuota",
  reconcileTenants: "reconcileTenants",
  reconcileMac: "reconcileMac",
  maintainMacPartitions: "maintainMacPartitions",
  scanCoexistRuns: "scanCoexistRuns",
  reconcileMetaCatalogSyncs: "reconcileMetaCatalogSyncs",
  purgeCoexistStaging: "purgeCoexistStaging",
  purgeWhatsappSignupSessions: "purgeWhatsappSignupSessions",
  purgeWorkspaces: "purgeWorkspaces",
  clearExpiredSupportAccess: "clearExpiredSupportAccess",
  purgeBroadcasts: "purgeBroadcasts",
  purgeAutomationThrottle: "purgeAutomationThrottle",
  purgeErrorLogs: "purgeErrorLogs",
  refreshChannelTokens: "refreshChannelTokens",
  unsubscribeExpiredTrials: "unsubscribeExpiredTrials",
  teardownExpiredTrial: "teardownExpiredTrial",
} as const

/**
 * Cadence (minutes) of the `purgeWorkspaces` cron. Shared so the scheduled
 * deletion timestamp can be rounded up to the same boundary the cron fires on,
 * keeping the deletion time shown in the UI honest (the banner renders
 * `scheduledDeletionAt` verbatim). The cron pattern in
 * `apps/worker/src/schedule/handlers/register-schedules.ts` is derived from
 * this value, so both stay in sync automatically. Keep it a divisor of 60 so
 * the derived every-N-minutes cron pattern remains valid.
 */
export const PURGE_WORKSPACES_INTERVAL_MINUTES = 30

/**
 * Cadence (minutes) of the `purgeBroadcasts` cron. The cron pattern in
 * `apps/worker/src/schedule/handlers/register-schedules.ts` is derived from
 * this value. Keep it a divisor of 60 so the derived every-N-minutes cron
 * pattern remains valid.
 */
export const PURGE_BROADCASTS_INTERVAL_MINUTES = 5

/**
 * Per-run concurrency for `purgeBroadcasts`: how many broadcasts have their
 * `ContactOnBroadcast` rows purged in parallel inside one schedule-worker
 * slot. Each stream is its own chunked delete loop
 * (`purgeBroadcastRecipients`), so this bounds concurrent DB purge streams,
 * not BullMQ worker slots — the cron itself still occupies exactly one of
 * the schedule worker's shared slots.
 */
export const PURGE_BROADCAST_CONCURRENCY = 5

export const broadcastSendJobId = (broadcastId: string) =>
  `broadcast-send-${broadcastId}`

export const teardownExpiredTrialJobId = (userId: string) =>
  `teardown-expired-trial-${userId}`

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

export type ScheduleJobEvaluateDateTimeWebhooks = {
  type: typeof ScheduleJobData.evaluateDateTimeWebhooks
  data: Record<string, never>
}

export type ScheduleJobCleanupWebhookExecutions = {
  type: typeof ScheduleJobData.cleanupWebhookExecutions
  data: Record<string, never>
}

export type ScheduleJobScanSmartDelay = {
  type: typeof ScheduleJobData.scanSmartDelay
  data: Record<string, never>
}

export const scheduleJobScanAppointmentRemindersDataSchema = z.object({
  triggeredAt: z.string().optional(),
})
export type ScheduleJobScanAppointmentReminders = {
  type: typeof ScheduleJobData.scanAppointmentReminders
  data: z.infer<typeof scheduleJobScanAppointmentRemindersDataSchema>
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

export type ScheduleJobReconcileMetaCatalogSyncs = {
  type: typeof ScheduleJobData.reconcileMetaCatalogSyncs
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

export type ScheduleJobPurgeWhatsappSignupSessions = {
  type: typeof ScheduleJobData.purgeWhatsappSignupSessions
  data: Record<string, never>
}

export type ScheduleJobPurgeWorkspaces = {
  type: typeof ScheduleJobData.purgeWorkspaces
  data: Record<string, never>
}

export type ScheduleJobClearExpiredSupportAccess = {
  type: typeof ScheduleJobData.clearExpiredSupportAccess
  data: Record<string, never>
}

export type ScheduleJobPurgeBroadcasts = {
  type: typeof ScheduleJobData.purgeBroadcasts
  data: Record<string, never>
}

export type ScheduleJobPurgeAutomationThrottle = {
  type: typeof ScheduleJobData.purgeAutomationThrottle
  data: Record<string, never>
}

export type ScheduleJobPurgeErrorLogs = {
  type: typeof ScheduleJobData.purgeErrorLogs
  data: Record<string, never>
}

export type ScheduleJobRefreshChannelTokens = {
  type: typeof ScheduleJobData.refreshChannelTokens
  // No `channels` = refresh every channel. The short-lived scheduler passes
  // ["zalo", "tiktok"] for the extra midday run (see register-schedules.ts).
  data: { channels?: ChannelType[] }
}

export type ScheduleJobUnsubscribeExpiredTrials = {
  type: typeof ScheduleJobData.unsubscribeExpiredTrials
  data: { cursor?: string }
}

export type ScheduleJobTeardownExpiredTrial = {
  type: typeof ScheduleJobData.teardownExpiredTrial
  data: { userId: string }
}

export type ScheduleJobData =
  | ScheduleJobBroadcast
  | ScheduleJobEnqueueBroadcast
  | ScheduleJobPrepareBroadcast
  | ScheduleJobFinalizeBroadcasts
  | ScheduleJobReconcileBroadcasts
  | ScheduleJobEvaluateTriggers
  | ScheduleJobCleanupTriggers
  | ScheduleJobEvaluateDateTimeWebhooks
  | ScheduleJobCleanupWebhookExecutions
  | ScheduleJobScanSmartDelay
  | ScheduleJobScanAppointmentReminders
  | ScheduleJobSyncUserQuota
  | ScheduleJobReconcileTenants
  | ScheduleJobReconcileMac
  | ScheduleJobMaintainMacPartitions
  | ScheduleJobScanCoexistRuns
  | ScheduleJobReconcileMetaCatalogSyncs
  | ScheduleJobPurgeCoexistStaging
  | ScheduleJobPurgeWhatsappSignupSessions
  | ScheduleJobPurgeWorkspaces
  | ScheduleJobClearExpiredSupportAccess
  | ScheduleJobPurgeBroadcasts
  | ScheduleJobPurgeAutomationThrottle
  | ScheduleJobPurgeErrorLogs
  | ScheduleJobRefreshChannelTokens
  | ScheduleJobUnsubscribeExpiredTrials
  | ScheduleJobTeardownExpiredTrial

export const scheduleQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<ScheduleJobData>(queueNames.enum.schedule, {
      connection: getRedisConnection(),
      defaultJobOptions,
    })
