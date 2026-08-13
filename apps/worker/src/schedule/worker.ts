import {
  defaultWorkerOptions,
  getRedisConnection,
  queueNames,
  ScheduleJobData,
  scheduleQueue,
} from "@chatbotx.io/worker-config"
import { type Job, Queue, Worker } from "bullmq"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"
import {
  cleanupTriggerExecutions,
  scanDateTimeTriggers,
} from "../trigger/datetime-trigger-scanner"
import {
  cleanupWebhookExecutions,
  scanDateTimeWebhooks,
} from "../webhook/datetime-webhook-scanner"
import { enqueueBroadcast } from "./handlers/enqueue-broadcast"
import { finalizeBroadcasts } from "./handlers/finalize-broadcasts"
import { maintainMacPartitions } from "./handlers/maintain-mac-partitions"
import { prepareBroadcast } from "./handlers/prepare-broadcast"
import { processBroadcastContacts } from "./handlers/process-broadcast-contacts"
import { purgeCoexistStaging } from "./handlers/purge-coexist-staging"
import { purgeWhatsappSignupSessions } from "./handlers/purge-whatsapp-signup-sessions"
import { purgeWorkspaces } from "./handlers/purge-workspaces"
import { reconcileBroadcasts } from "./handlers/reconcile-broadcasts"
import { reconcileMetaCatalogSyncs } from "./handlers/reconcile-meta-catalog-syncs"
import { reconcileTenants } from "./handlers/reconcile-tenants"
import { refreshChannelTokens } from "./handlers/refresh-channel-tokens"
import { registerSchedules } from "./handlers/register-schedules"
import { scanAppointmentReminders } from "./handlers/scan-appointment-reminders"
import { scanCoexistRuns } from "./handlers/scan-coexist-runs"
import { scanSmartDelay } from "./handlers/scan-smart-delay"
import { syncUserQuota } from "./handlers/sync-user-quota"
import { teardownExpiredTrial } from "./handlers/teardown-expired-trial"
import { unsubscribeExpiredTrials } from "./handlers/unsubscribe-expired-trials"

async function startScheduleWorker() {
  try {
    await ensureBootstrapped()
    logger.info("Analytics bootstrapped successfully")
  } catch (err) {
    logger.error(err, "Failed to bootstrap analytics")
    process.exit(1)
  }

  if (scheduleQueue instanceof Queue) {
    registerSchedules()
      .then(() => {
        logger.info("Schedules registered")
      })
      .catch((err) => {
        logger.error(err, "Error registering schedules")
      })
  }

  const worker = new Worker(
    queueNames.enum.schedule,
    async (job: Job<ScheduleJobData>) => {
      switch (job.data.type) {
        case ScheduleJobData.enqueueBroadcast:
          await enqueueBroadcast()
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

        case ScheduleJobData.syncUserQuota:
          await syncUserQuota()
          return

        case ScheduleJobData.reconcileTenants:
          await reconcileTenants()
          return

        case ScheduleJobData.maintainMacPartitions:
          await maintainMacPartitions()
          return

        case ScheduleJobData.scanCoexistRuns:
          await scanCoexistRuns()
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

        case ScheduleJobData.purgeWorkspaces:
          await purgeWorkspaces()
          return

        case ScheduleJobData.refreshChannelTokens:
          await refreshChannelTokens()
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
    {
      connection: getRedisConnection(),
      ...defaultWorkerOptions,
    },
  )

  worker.on("failed", (job, err) => {
    if (job) {
      logger.error(err, `Job ${job.id} has failed`)
    }
  })

  let isShuttingDown = false
  async function shutdown() {
    if (isShuttingDown) {
      return
    }
    isShuttingDown = true
    try {
      await worker.close()
      process.exit(0)
    } catch (err) {
      logger.error(err, "[ScheduleWorker] Error during shutdown")
      process.exit(1)
    }
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}

startScheduleWorker().catch((err) => {
  logger.error("Failed to start schedule worker", err)
  process.exit(1)
})
