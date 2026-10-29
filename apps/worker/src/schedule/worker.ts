import {
  queueNames,
  ScheduleJobData,
  scheduleQueue,
} from "@chatbotx.io/worker-config"
import { type Job, Queue } from "bullmq"
import { createQueueWorker } from "../lib/create-queue-worker"
import { logger } from "../lib/logger"
import { runJobWithAuditContext } from "../lib/run-job-with-audit-context"
import { runWorker } from "../lib/shutdown"
import {
  cleanupTriggerExecutions,
  scanDateTimeTriggers,
} from "../trigger/datetime-trigger-scanner"
import {
  cleanupWebhookExecutions,
  scanDateTimeWebhooks,
} from "../webhook/datetime-webhook-scanner"
import { clearExpiredSupportAccess } from "./handlers/clear-expired-support-access"
import { dispatchMarketingMessages } from "./handlers/dispatch-marketing-messages"
import { dispatchProfileSnapshots } from "./handlers/dispatch-profile-snapshots"
import { enqueueBroadcast } from "./handlers/enqueue-broadcast"
import { enqueueMarketingMessages } from "./handlers/enqueue-marketing-messages"
import { enqueueRecurringBroadcasts } from "./handlers/enqueue-recurring-broadcasts"
import { expireUnpaidOrders } from "./handlers/expire-unpaid-orders"
import { finalizeBroadcasts } from "./handlers/finalize-broadcasts"
import { finalizeMarketingMessages } from "./handlers/finalize-marketing-messages"
import {
  googleAdsHousekeeping,
  googleAdsSyncSetups,
} from "./handlers/google-ads-housekeeping"
import {
  finishOverdueLeaderboards,
  maintainLeaderboardRankings,
} from "./handlers/leaderboard-schedules"
import { maintainLeaderboardPartitions } from "./handlers/maintain-leaderboard-partitions"
import { maintainMacPartitions } from "./handlers/maintain-mac-partitions"
import { materializeRecurringBroadcasts } from "./handlers/materialize-recurring-broadcasts"
import { prepareBroadcast } from "./handlers/prepare-broadcast"
import { processBroadcastContacts } from "./handlers/process-broadcast-contacts"
import { purgeAutomationThrottle } from "./handlers/purge-automation-throttle"
import { purgeBroadcasts } from "./handlers/purge-broadcasts"
import { purgeCoexistStaging } from "./handlers/purge-coexist-staging"
import { purgeCommentAutomationEvents } from "./handlers/purge-comment-automation-events"
import { purgeErrorLogs } from "./handlers/purge-error-logs"
import { purgeExpiredCallRecordings } from "./handlers/purge-expired-call-recordings"
import { purgeExpiredConnectSessions } from "./handlers/purge-expired-connect-sessions"
import { purgeExpiredContactExports } from "./handlers/purge-expired-contact-exports"
import { purgeInboundWebhookRequests } from "./handlers/purge-inbound-webhook-requests"
import { purgeExpiredOAuthTokens } from "./handlers/purge-expired-oauth-tokens"
import { purgeWhatsappSignupSessions } from "./handlers/purge-whatsapp-signup-sessions"
import { purgeWorkspaces } from "./handlers/purge-workspaces"
import { reconcileBroadcasts } from "./handlers/reconcile-broadcasts"
import { reconcileMetaCatalogSyncs } from "./handlers/reconcile-meta-catalog-syncs"
import { reconcileTenants } from "./handlers/reconcile-tenants"
import { redispatchInboundWebhookRequests } from "./handlers/redispatch-inbound-webhook-requests"
import { refreshChannelTokens } from "./handlers/refresh-channel-tokens"
import { refreshLicense } from "./handlers/refresh-license"
import { registerSchedules } from "./handlers/register-schedules"
import { scanAbandonedCarts } from "./handlers/scan-abandoned-carts"
import { scanAiHandoverBulkRuns } from "./handlers/scan-ai-handover-bulk-runs"
import { scanAppointmentReminders } from "./handlers/scan-appointment-reminders"
import { scanCoexistRuns } from "./handlers/scan-coexist-runs"
import { scanContactScans } from "./handlers/scan-contact-scans"
import { scanSmartDelay } from "./handlers/scan-smart-delay"
import { sweepStaleWhatsappCalls } from "./handlers/sweep-stale-whatsapp-calls"
import { syncUserQuota } from "./handlers/sync-user-quota"
import { teardownExpiredTrial } from "./handlers/teardown-expired-trial"
import { unsubscribeExpiredTrials } from "./handlers/unsubscribe-expired-trials"

async function startScheduleWorker() {
  if (scheduleQueue instanceof Queue) {
    // A registration failure must not take the shared process down: the
    // consumers below still serve already-registered schedules.
    try {
      await registerSchedules()
      logger.info("Schedules registered")
    } catch (err) {
      logger.error({ err }, "Error registering schedules")
    }
  }

  createQueueWorker(
    queueNames.enum.schedule,
    async (job: Job<ScheduleJobData>) =>
      runJobWithAuditContext(
        { source: `schedule:${job.data.type}` },
        async () => {
          switch (job.data.type) {
            case ScheduleJobData.enqueueBroadcast:
              await enqueueBroadcast()
              return

            case ScheduleJobData.enqueueRecurringBroadcasts:
              await enqueueRecurringBroadcasts()
              return

            case ScheduleJobData.materializeRecurringBroadcasts:
              await materializeRecurringBroadcasts(job.data.data.items)
              return

            case ScheduleJobData.prepareBroadcast:
              await prepareBroadcast(job.data.data.broadcastId)
              return

            case ScheduleJobData.sendBroadcast:
              await processBroadcastContacts(job.data.data.broadcastId)
              return

            case ScheduleJobData.finalizeBroadcasts:
              await finalizeBroadcasts()
              return

            case ScheduleJobData.reconcileBroadcasts:
              await reconcileBroadcasts()
              return

            case ScheduleJobData.enqueueMarketingMessages:
              await enqueueMarketingMessages()
              return

            case ScheduleJobData.dispatchMarketingMessages:
              await dispatchMarketingMessages()
              return

            case ScheduleJobData.finalizeMarketingMessages:
              await finalizeMarketingMessages()
              return

            case ScheduleJobData.evaluateTriggers:
              await scanDateTimeTriggers()
              return

            case ScheduleJobData.cleanupTriggers:
              await cleanupTriggerExecutions()
              return

            case ScheduleJobData.evaluateDateTimeWebhooks:
              await scanDateTimeWebhooks()
              return

            case ScheduleJobData.cleanupWebhookExecutions:
              await cleanupWebhookExecutions()
              return

            case ScheduleJobData.scanSmartDelay:
              await scanSmartDelay()
              return

            case ScheduleJobData.scanAppointmentReminders:
              await scanAppointmentReminders(job.data.data)
              return

            case ScheduleJobData.scanAbandonedCarts:
              await scanAbandonedCarts()
              return

            case ScheduleJobData.expireUnpaidOrders:
              await expireUnpaidOrders()
              return

            case ScheduleJobData.syncUserQuota:
              await syncUserQuota()
              return

            case ScheduleJobData.reconcileTenants:
              await reconcileTenants()
              return

            case ScheduleJobData.maintainMacPartitions:
              await maintainMacPartitions()
              return

            case ScheduleJobData.maintainLeaderboardPartitions:
              await maintainLeaderboardPartitions()
              return

            case ScheduleJobData.finishOverdueLeaderboards:
              await finishOverdueLeaderboards()
              return

            case ScheduleJobData.maintainLeaderboardRankings:
              await maintainLeaderboardRankings()
              return

            case ScheduleJobData.scanCoexistRuns:
              await scanCoexistRuns()
              return

            case ScheduleJobData.scanContactScans:
              await scanContactScans()
              return

            case ScheduleJobData.scanAiHandoverBulkRuns:
              await scanAiHandoverBulkRuns()
              return

            case ScheduleJobData.reconcileMetaCatalogSyncs:
              await reconcileMetaCatalogSyncs()
              return

            case ScheduleJobData.purgeCoexistStaging:
              await purgeCoexistStaging()
              return

            case ScheduleJobData.purgeWhatsappSignupSessions:
              await purgeWhatsappSignupSessions()
              return

            case ScheduleJobData.purgeExpiredConnectSessions:
              await purgeExpiredConnectSessions()
              return

            case ScheduleJobData.purgeWorkspaces:
              await purgeWorkspaces()
              return

            case ScheduleJobData.clearExpiredSupportAccess:
              await clearExpiredSupportAccess()
              return

            case ScheduleJobData.googleAdsHousekeeping:
              await googleAdsHousekeeping()
              return

            case ScheduleJobData.googleAdsSyncSetups:
              await googleAdsSyncSetups()
              return

            case ScheduleJobData.dispatchProfileSnapshots:
              await dispatchProfileSnapshots()
              return

            case ScheduleJobData.purgeExpiredOAuthTokens:
              await purgeExpiredOAuthTokens()
              return

            case ScheduleJobData.purgeBroadcasts:
              await purgeBroadcasts()
              return

            case ScheduleJobData.purgeAutomationThrottle:
              await purgeAutomationThrottle()
              return

            // Not workspace-scoped, so no `isBlockedJob` guard (invariant 15
            // excludes schedule crons other than the two broadcast handlers).
            case ScheduleJobData.purgeErrorLogs:
              await purgeErrorLogs()
              return

            // Not workspace-scoped (the jobs they enqueue are guarded in the
            // default worker), so no `isBlockedJob` guard here either.
            case ScheduleJobData.redispatchInboundWebhookRequests:
              await redispatchInboundWebhookRequests()
              return

            case ScheduleJobData.purgeInboundWebhookRequests:
              await purgeInboundWebhookRequests()
              return

            case ScheduleJobData.purgeCommentAutomationEvents:
              await purgeCommentAutomationEvents()
              return

            case ScheduleJobData.purgeExpiredCallRecordings:
              await purgeExpiredCallRecordings()
              return

            // Not workspace-scoped: one sweep over every workspace's exports.
            case ScheduleJobData.purgeExpiredContactExports:
              await purgeExpiredContactExports()
              return

            case ScheduleJobData.sweepStaleWhatsappCalls:
              await sweepStaleWhatsappCalls()
              return

            case ScheduleJobData.refreshChannelTokens:
              await refreshChannelTokens(job.data.data.channels)
              return

            case ScheduleJobData.refreshLicense:
              await refreshLicense()
              return

            case ScheduleJobData.unsubscribeExpiredTrials:
              await unsubscribeExpiredTrials(job.data.data.cursor)
              return

            case ScheduleJobData.teardownExpiredTrial:
              await teardownExpiredTrial(job.data.data.userId)
              return

            default:
              logger.warn("Unknown schedule job type")
          }
        },
      ),
  )
}

runWorker("schedule", startScheduleWorker)
