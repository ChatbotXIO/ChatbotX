import type { ChannelType } from "@chatbotx.io/database/partials"
import { Queue } from "bullmq"
import { z } from "zod"
import {
  defaultJobOptions,
  fakeQueue,
  getQueueConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

export const ScheduleJobData = {
  enqueueBroadcast: "enqueueBroadcast",
  enqueueRecurringBroadcasts: "enqueueRecurringBroadcasts",
  materializeRecurringBroadcasts: "materializeRecurringBroadcasts",
  prepareBroadcast: "prepareBroadcast",
  purgeDraftBroadcastRecipients: "purgeDraftBroadcastRecipients",
  sendBroadcast: "sendBroadcast",
  reconcileBroadcasts: "reconcileBroadcasts",
  enqueueMarketingMessages: "enqueueMarketingMessages",
  dispatchMarketingMessages: "dispatchMarketingMessages",
  finalizeMarketingMessages: "finalizeMarketingMessages",
  finalizeBroadcasts: "finalizeBroadcasts",
  evaluateTriggers: "evaluateTriggers",
  cleanupTriggers: "cleanupTriggers",
  evaluateDateTimeWebhooks: "evaluateDateTimeWebhooks",
  cleanupWebhookExecutions: "cleanupWebhookExecutions",
  scanSmartDelay: "scanSmartDelay",
  scanAppointmentReminders: "scanAppointmentReminders",
  scanAbandonedCarts: "scanAbandonedCarts",
  expireUnpaidOrders: "expireUnpaidOrders",
  syncUserQuota: "syncUserQuota",
  reconcileTenants: "reconcileTenants",
  reconcileMac: "reconcileMac",
  maintainMacPartitions: "maintainMacPartitions",
  maintainLeaderboardPartitions: "maintainLeaderboardPartitions",
  finishOverdueLeaderboards: "finishOverdueLeaderboards",
  maintainLeaderboardRankings: "maintainLeaderboardRankings",
  scanCoexistRuns: "scanCoexistRuns",
  scanContactScans: "scanContactScans",
  scanAiHandoverBulkRuns: "scanAiHandoverBulkRuns",
  reconcileMetaCatalogSyncs: "reconcileMetaCatalogSyncs",
  purgeCoexistStaging: "purgeCoexistStaging",
  purgeWhatsappSignupSessions: "purgeWhatsappSignupSessions",
  purgeExpiredConnectSessions: "purgeExpiredConnectSessions",
  purgeWorkspaces: "purgeWorkspaces",
  clearExpiredSupportAccess: "clearExpiredSupportAccess",
  googleAdsHousekeeping: "googleAdsHousekeeping",
  googleAdsSyncSetups: "googleAdsSyncSetups",
  purgeExpiredOAuthTokens: "purgeExpiredOAuthTokens",
  purgeBroadcasts: "purgeBroadcasts",
  purgeAutomationThrottle: "purgeAutomationThrottle",
  purgeErrorLogs: "purgeErrorLogs",
  redispatchInboundWebhookRequests: "redispatchInboundWebhookRequests",
  redispatchTemplateJobs: "redispatchTemplateJobs",
  purgeInboundWebhookRequests: "purgeInboundWebhookRequests",
  purgeCommentAutomationEvents: "purgeCommentAutomationEvents",
  refreshChannelTokens: "refreshChannelTokens",
  refreshLicense: "refreshLicense",
  unsubscribeExpiredTrials: "unsubscribeExpiredTrials",
  teardownExpiredTrial: "teardownExpiredTrial",
  purgeExpiredContactExports: "purgeExpiredContactExports",
  // WhatsApp calling.
  purgeExpiredCallRecordings: "purgeExpiredCallRecordings",
  sweepStaleWhatsappCalls: "sweepStaleWhatsappCalls",
  dispatchProfileSnapshots: "dispatchProfileSnapshots",
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

/** Shared by every producer of a `prepareBroadcast` job, so the same broadcast is never prepared twice. */
export const broadcastPrepareJobId = (broadcastId: string) =>
  `schedule-prepare-broadcast-${broadcastId}`

/**
 * Who asks for a draft's leftover-recipient cleanup: the draft transitions
 * (`moveToDraft`, a refused `scheduleDraft`) or a stale prepare run that wrote
 * a chunk after `moveToDraft`.
 */
export type BroadcastDraftPurgeRequester = "draft" | "stalePrepare"

/**
 * One cleanup per draft and requester: re-asking while one is queued or
 * running is a no-op. A stale prepare gets its own id so its request never
 * folds into a cleanup that is just finishing — that one may have checked
 * before the prepare's last chunk landed.
 */
export const broadcastDraftPurgeJobId = (
  broadcastId: string,
  requester: BroadcastDraftPurgeRequester,
) => `schedule-purge-draft-broadcast-${broadcastId}-${requester}`

/** Series handled by one `materializeRecurringBroadcasts` job. */
export const MATERIALIZE_BATCH_SIZE = 100
/** Series a schedule-worker slot materializes in parallel inside one job. */
export const MATERIALIZE_ITEM_CONCURRENCY = 10
/**
 * BullMQ priority of `materializeRecurringBroadcasts` batches. Jobs without a
 * priority run before any prioritized job, so a burst of due series always
 * yields to the other schedule jobs (crons, prepare/send broadcast). No other
 * schedule job is prioritized, so the queue's prioritized count is exactly the
 * pending batches.
 */
export const MATERIALIZE_RECURRING_BROADCASTS_PRIORITY = 10

/** No `:` — BullMQ rejects it in a custom job id. */
export const materializeBatchJobId = (
  dueAtMs: number,
  page: number,
  chunk: number,
) => `broadcast-recurrence-${dueAtMs}-${page}-${chunk}`

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

export type ScheduleJobEnqueueRecurringBroadcasts = {
  type: typeof ScheduleJobData.enqueueRecurringBroadcasts
  data: Record<string, never>
}

/** One due slot: the series, its workspace (for the blocked-owner guard) and the armed instant. */
export type MaterializeRecurringBroadcastItem = {
  recurrenceId: string
  workspaceId: string
  occurrenceAtMs: number
}

/** Turns due slots of repeating broadcasts into runs; the runs are then sent by the existing pipeline. */
export type ScheduleJobMaterializeRecurringBroadcasts = {
  type: typeof ScheduleJobData.materializeRecurringBroadcasts
  data: { items: MaterializeRecurringBroadcastItem[] }
}

export type ScheduleJobPrepareBroadcast = {
  type: typeof ScheduleJobData.prepareBroadcast
  data: {
    broadcastId: string
  }
}

export type ScheduleJobPurgeDraftBroadcastRecipients = {
  type: typeof ScheduleJobData.purgeDraftBroadcastRecipients
  data: {
    workspaceId: string
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

export type ScheduleJobScanAbandonedCarts = {
  type: typeof ScheduleJobData.scanAbandonedCarts
  data: Record<string, never>
}

/** Every minute: cancels online orders whose payment never came in time. */
export type ScheduleJobExpireUnpaidOrders = {
  type: typeof ScheduleJobData.expireUnpaidOrders
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

export type ScheduleJobScanContactScans = {
  type: typeof ScheduleJobData.scanContactScans
  data: Record<string, never>
}

export type ScheduleJobScanAiHandoverBulkRuns = {
  type: typeof ScheduleJobData.scanAiHandoverBulkRuns
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

export type ScheduleJobMaintainLeaderboardPartitions = {
  type: typeof ScheduleJobData.maintainLeaderboardPartitions
  data: Record<string, never>
}

export type ScheduleJobFinishOverdueLeaderboards = {
  type: typeof ScheduleJobData.finishOverdueLeaderboards
  data: Record<string, never>
}

export type ScheduleJobMaintainLeaderboardRankings = {
  type: typeof ScheduleJobData.maintainLeaderboardRankings
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
export type ScheduleJobPurgeExpiredConnectSessions = {
  type: typeof ScheduleJobData.purgeExpiredConnectSessions
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

export type ScheduleJobGoogleAdsHousekeeping = {
  type: typeof ScheduleJobData.googleAdsHousekeeping
  data: Record<string, never>
}

export type ScheduleJobGoogleAdsSyncSetups = {
  type: typeof ScheduleJobData.googleAdsSyncSetups
  data: Record<string, never>
}

export type ScheduleJobDispatchProfileSnapshots = {
  type: typeof ScheduleJobData.dispatchProfileSnapshots
  data: Record<string, never>
}

export type ScheduleJobPurgeExpiredOAuthTokens = {
  type: typeof ScheduleJobData.purgeExpiredOAuthTokens
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

export type ScheduleJobRedispatchInboundWebhookRequests = {
  type: typeof ScheduleJobData.redispatchInboundWebhookRequests
  data: Record<string, never>
}

export type ScheduleJobRedispatchTemplateJobs = {
  type: typeof ScheduleJobData.redispatchTemplateJobs
  data: Record<string, never>
}

export type ScheduleJobPurgeInboundWebhookRequests = {
  type: typeof ScheduleJobData.purgeInboundWebhookRequests
  data: Record<string, never>
}

export type ScheduleJobPurgeCommentAutomationEvents = {
  type: typeof ScheduleJobData.purgeCommentAutomationEvents
  data: Record<string, never>
}

export type ScheduleJobRefreshChannelTokens = {
  type: typeof ScheduleJobData.refreshChannelTokens
  // No `channels` = refresh every channel. The short-lived scheduler passes
  // ["zalo", "tiktok"] for the extra midday run (see register-schedules.ts).
  data: { channels?: ChannelType[] }
}

export type ScheduleJobRefreshLicense = {
  type: typeof ScheduleJobData.refreshLicense
  data: Record<string, never>
}

export type ScheduleJobUnsubscribeExpiredTrials = {
  type: typeof ScheduleJobData.unsubscribeExpiredTrials
  data: { cursor?: string }
}

export type ScheduleJobTeardownExpiredTrial = {
  type: typeof ScheduleJobData.teardownExpiredTrial
  data: { userId: string }
}

/** Daily retention sweep: deletes contact exports past their retention (file, then row). */
export type ScheduleJobPurgeExpiredContactExports = {
  type: typeof ScheduleJobData.purgeExpiredContactExports
  data: Record<string, never>
}

/** Daily retention sweep: deletes expired call recordings' S3 objects and clears the columns. */
export type ScheduleJobPurgeExpiredCallRecordings = {
  type: typeof ScheduleJobData.purgeExpiredCallRecordings
  data: Record<string, never>
}

/** Every 5 minutes: `ringing` call rows older than 90s that were never finalized -> `failed`. */
export type ScheduleJobSweepStaleWhatsappCalls = {
  type: typeof ScheduleJobData.sweepStaleWhatsappCalls
  data: Record<string, never>
}

export type ScheduleJobEnqueueMarketingMessages = {
  type: typeof ScheduleJobData.enqueueMarketingMessages
  data: Record<string, never>
}

export type ScheduleJobDispatchMarketingMessages = {
  type: typeof ScheduleJobData.dispatchMarketingMessages
  data: Record<string, never>
}

export type ScheduleJobFinalizeMarketingMessages = {
  type: typeof ScheduleJobData.finalizeMarketingMessages
  data: Record<string, never>
}

export type ScheduleJobData =
  | ScheduleJobEnqueueMarketingMessages
  | ScheduleJobDispatchMarketingMessages
  | ScheduleJobFinalizeMarketingMessages
  | ScheduleJobBroadcast
  | ScheduleJobEnqueueBroadcast
  | ScheduleJobEnqueueRecurringBroadcasts
  | ScheduleJobMaterializeRecurringBroadcasts
  | ScheduleJobPrepareBroadcast
  | ScheduleJobPurgeDraftBroadcastRecipients
  | ScheduleJobFinalizeBroadcasts
  | ScheduleJobReconcileBroadcasts
  | ScheduleJobEvaluateTriggers
  | ScheduleJobCleanupTriggers
  | ScheduleJobEvaluateDateTimeWebhooks
  | ScheduleJobCleanupWebhookExecutions
  | ScheduleJobScanSmartDelay
  | ScheduleJobScanAppointmentReminders
  | ScheduleJobScanAbandonedCarts
  | ScheduleJobExpireUnpaidOrders
  | ScheduleJobSyncUserQuota
  | ScheduleJobReconcileTenants
  | ScheduleJobReconcileMac
  | ScheduleJobMaintainMacPartitions
  | ScheduleJobMaintainLeaderboardPartitions
  | ScheduleJobFinishOverdueLeaderboards
  | ScheduleJobMaintainLeaderboardRankings
  | ScheduleJobScanCoexistRuns
  | ScheduleJobScanContactScans
  | ScheduleJobScanAiHandoverBulkRuns
  | ScheduleJobReconcileMetaCatalogSyncs
  | ScheduleJobPurgeCoexistStaging
  | ScheduleJobPurgeWhatsappSignupSessions
  | ScheduleJobPurgeExpiredConnectSessions
  | ScheduleJobPurgeWorkspaces
  | ScheduleJobClearExpiredSupportAccess
  | ScheduleJobGoogleAdsHousekeeping
  | ScheduleJobGoogleAdsSyncSetups
  | ScheduleJobDispatchProfileSnapshots
  | ScheduleJobPurgeExpiredOAuthTokens
  | ScheduleJobPurgeBroadcasts
  | ScheduleJobPurgeAutomationThrottle
  | ScheduleJobPurgeErrorLogs
  | ScheduleJobRedispatchInboundWebhookRequests
  | ScheduleJobRedispatchTemplateJobs
  | ScheduleJobPurgeInboundWebhookRequests
  | ScheduleJobPurgeCommentAutomationEvents
  | ScheduleJobRefreshChannelTokens
  | ScheduleJobRefreshLicense
  | ScheduleJobUnsubscribeExpiredTrials
  | ScheduleJobTeardownExpiredTrial
  | ScheduleJobPurgeExpiredContactExports
  | ScheduleJobPurgeExpiredCallRecordings
  | ScheduleJobSweepStaleWhatsappCalls

export const scheduleQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<ScheduleJobData>(queueNames.enum.schedule, {
      connection: getQueueConnection(queueNames.enum.schedule),
      defaultJobOptions,
    })
