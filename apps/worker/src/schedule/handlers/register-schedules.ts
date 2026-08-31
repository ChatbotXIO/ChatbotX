import { channelTypes } from "@chatbotx.io/database/partials"
import {
  PURGE_WORKSPACES_INTERVAL_MINUTES,
  ScheduleJobData,
  scheduleQueue,
} from "@chatbotx.io/worker-config"
import { Queue } from "bullmq"
import { env } from "../../env"

/**
 * Quota/billing schedulers only make sense on the cloud edition. The trial
 * teardown is the dangerous one: it disconnects every channel of an expired
 * trial owner, and off-cloud there is no billing path to recover from that.
 */
const CLOUD_ONLY_SCHEDULERS = [
  ScheduleJobData.syncUserQuota,
  ScheduleJobData.reconcileTenants,
  ScheduleJobData.unsubscribeExpiredTrials,
] as const

export const registerSchedules = async () => {
  if (!(scheduleQueue instanceof Queue)) {
    return
  }

  const isCloud = env.NEXT_PUBLIC_EDITION === "cloud"
  if (!isCloud) {
    // upsertJobScheduler persists in Redis: a scheduler registered by an
    // earlier cloud boot (or a shared Redis) keeps firing until removed.
    for (const name of CLOUD_ONLY_SCHEDULERS) {
      await scheduleQueue.removeJobScheduler(name)
    }
  }

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.enqueueBroadcast,
    {
      pattern: "* * * * *",
    },
    {
      name: ScheduleJobData.enqueueBroadcast,
      data: {
        type: ScheduleJobData.enqueueBroadcast,
        data: {
          schedulesAt: new Date(),
        },
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.finalizeBroadcasts,
    {
      pattern: "* * * * *",
    },
    {
      name: ScheduleJobData.finalizeBroadcasts,
      data: {
        type: ScheduleJobData.finalizeBroadcasts,
        data: {},
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.reconcileBroadcasts,
    {
      pattern: "* * * * *",
    },
    {
      name: ScheduleJobData.reconcileBroadcasts,
      data: {
        type: ScheduleJobData.reconcileBroadcasts,
        data: {},
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.evaluateTriggers,
    {
      pattern: "* * * * *",
      // every: 5000,
    },
    {
      name: ScheduleJobData.evaluateTriggers,
      data: {
        type: ScheduleJobData.evaluateTriggers,
        data: {},
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.cleanupTriggers,
    {
      pattern: "0 3 * * *",
    },
    {
      name: ScheduleJobData.cleanupTriggers,
      data: {
        type: ScheduleJobData.cleanupTriggers,
        data: {},
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.evaluateDateTimeWebhooks,
    {
      pattern: "* * * * *",
    },
    {
      name: ScheduleJobData.evaluateDateTimeWebhooks,
      data: {
        type: ScheduleJobData.evaluateDateTimeWebhooks,
        data: {},
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.cleanupWebhookExecutions,
    {
      pattern: "0 4 * * *",
    },
    {
      name: ScheduleJobData.cleanupWebhookExecutions,
      data: {
        type: ScheduleJobData.cleanupWebhookExecutions,
        data: {},
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.scanSmartDelay,
    {
      pattern: "*/5 * * * *",
    },
    {
      name: ScheduleJobData.scanSmartDelay,
      data: {
        type: ScheduleJobData.scanSmartDelay,
        data: {},
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.scanAppointmentReminders,
    {
      pattern: "*/5 * * * *",
    },
    {
      name: ScheduleJobData.scanAppointmentReminders,
      data: {
        type: ScheduleJobData.scanAppointmentReminders,
        data: {
          triggeredAt: new Date().toISOString(),
        },
      },
    },
  )

  if (isCloud) {
    await scheduleQueue.upsertJobScheduler(
      ScheduleJobData.syncUserQuota,
      { every: env.QUOTA_SYNC_INTERVAL_SECONDS * 1000 },
      {
        name: ScheduleJobData.syncUserQuota,
        data: { type: ScheduleJobData.syncUserQuota, data: {} },
      },
    )

    await scheduleQueue.upsertJobScheduler(
      ScheduleJobData.reconcileTenants,
      { every: env.QUOTA_SYNC_INTERVAL_SECONDS * 1000 },
      {
        name: ScheduleJobData.reconcileTenants,
        data: { type: ScheduleJobData.reconcileTenants, data: {} },
      },
    )
  }

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.maintainMacPartitions,
    {
      pattern: "0 1 * * *",
    },
    {
      name: ScheduleJobData.maintainMacPartitions,
      data: {
        type: ScheduleJobData.maintainMacPartitions,
        data: {},
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.scanCoexistRuns,
    {
      pattern: "* * * * *",
    },
    {
      name: ScheduleJobData.scanCoexistRuns,
      data: {
        type: ScheduleJobData.scanCoexistRuns,
        data: {},
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.reconcileMetaCatalogSyncs,
    {
      pattern: "* * * * *",
    },
    {
      name: ScheduleJobData.reconcileMetaCatalogSyncs,
      data: {
        type: ScheduleJobData.reconcileMetaCatalogSyncs,
        data: {},
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.purgeCoexistStaging,
    {
      pattern: "0 * * * *",
    },
    {
      name: ScheduleJobData.purgeCoexistStaging,
      data: {
        type: ScheduleJobData.purgeCoexistStaging,
        data: {},
      },
    },
  )

  // Deliberately NOT in CLOUD_ONLY_SCHEDULERS — retention applies to every
  // edition.
  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.purgeErrorLogs,
    {
      pattern: "0 3 * * *",
    },
    {
      name: ScheduleJobData.purgeErrorLogs,
      data: {
        type: ScheduleJobData.purgeErrorLogs,
        data: {},
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.purgeWhatsappSignupSessions,
    {
      pattern: "0 * * * *",
    },
    {
      name: ScheduleJobData.purgeWhatsappSignupSessions,
      data: {
        type: ScheduleJobData.purgeWhatsappSignupSessions,
        data: {},
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.purgeWorkspaces,
    {
      pattern: `*/${PURGE_WORKSPACES_INTERVAL_MINUTES} * * * *`,
    },
    {
      name: ScheduleJobData.purgeWorkspaces,
      data: {
        type: ScheduleJobData.purgeWorkspaces,
        data: {},
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.purgeAutomationThrottle,
    {
      pattern: "0 * * * *",
    },
    {
      name: ScheduleJobData.purgeAutomationThrottle,
      data: {
        type: ScheduleJobData.purgeAutomationThrottle,
        data: {},
      },
    },
  )

  await scheduleQueue.upsertJobScheduler(
    ScheduleJobData.refreshChannelTokens,
    {
      pattern: "0 2 * * *",
    },
    {
      name: ScheduleJobData.refreshChannelTokens,
      data: {
        type: ScheduleJobData.refreshChannelTokens,
        data: {},
      },
    },
  )

  // Zalo and TikTok tokens only live ~24-25h, so the single 02:00 run leaves
  // almost no margin: one missed run and they expire mid-day. This extra
  // midday run keeps them at most ~12h from a refresh; the long-lived
  // Meta/WhatsApp tokens stay on the daily run above.
  await scheduleQueue.upsertJobScheduler(
    "refreshShortLivedChannelTokens",
    {
      pattern: "0 14 * * *",
    },
    {
      name: ScheduleJobData.refreshChannelTokens,
      data: {
        type: ScheduleJobData.refreshChannelTokens,
        data: {
          channels: [channelTypes.enum.zalo, channelTypes.enum.tiktok],
        },
      },
    },
  )

  if (isCloud) {
    await scheduleQueue.upsertJobScheduler(
      ScheduleJobData.unsubscribeExpiredTrials,
      {
        pattern: "0 * * * *",
      },
      {
        name: ScheduleJobData.unsubscribeExpiredTrials,
        data: {
          type: ScheduleJobData.unsubscribeExpiredTrials,
          data: {},
        },
      },
    )
  }
}
