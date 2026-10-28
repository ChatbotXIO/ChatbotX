import {
  commentAutomationService,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import {
  type LeaderboardJobData,
  LowJobAction,
  type LowJobData,
  type ProfileSnapshotJobData,
  queueNames,
} from "@chatbotx.io/worker-config"
import type { Job } from "bullmq"
import { env } from "../env"
import { captureContactProfileSnapshot } from "../integration/handlers/capture-contact-profile-snapshot"
import { coexistAttachmentDownload } from "../integration/handlers/coexist/attachment-download"
import { updateContactAvatar } from "../integration/handlers/contact/update-avatar"
import { receiveComment } from "../integration/handlers/received-message"
import { processLeaderboardJob } from "../leaderboard/process-job"
import { createQueueWorker } from "../lib/create-queue-worker"
import { logger } from "../lib/logger"
import { runJobWithAuditContext } from "../lib/run-job-with-audit-context"
import { runWorker } from "../lib/shutdown"

/**
 * Runs one `low` job behind the blocked-owner guard, dispatching on its type.
 */
async function processLowJob(job: Job<LowJobData>): Promise<void> {
  const workspaceId = job.data.data.workspaceId
  await withBlockedOwnerGuard(workspaceId, async () => {
    await runJobWithAuditContext(
      { workspaceId, source: `low:${job.data.type}` },
      async () => {
        switch (job.data.type) {
          case LowJobAction.coexistAttachmentDownload: {
            await coexistAttachmentDownload(job, job.data.data)
            return
          }
          case LowJobAction.updateContactAvatar: {
            await updateContactAvatar(job.data.data)
            return
          }
          case LowJobAction.replayMissedComment: {
            await receiveComment(job.data.data)
            return
          }
          default: {
            // Exhaustiveness guard — a new LowJobData variant without a
            // case here becomes a compile error.
            const _exhaustive: never = job.data
            logger.warn({ data: _exhaustive }, "Unhandled low job type")
            return
          }
        }
      },
    )
  })
}

/**
 * A missed-comment replay counts down its run's "processing" status whatever
 * happened to it — replied, declined, skipped by the owner guard or failed —
 * so the status clears when the last one is done. Never throws: a failed
 * count-down must not hide the job's own error or fail a job that succeeded.
 */
async function settleMissedCommentReplay(job: Job<LowJobData>): Promise<void> {
  if (job.data.type !== LowJobAction.replayMissedComment) {
    return
  }
  const { automationId } = job.data.data.replay
  try {
    await commentAutomationService.finishMissedCommentReplay(automationId)
  } catch (err) {
    logger.error(
      { err, automationId, jobId: job.id },
      "Failed to count down a missed-comment replay",
    )
  }
}

/**
 * Consumer for the `low` workload-class queue: light, high-volume, low-priority
 * jobs deliberately kept off the latency-sensitive `integration` queue so a
 * historical-import burst never starves customer replies.
 *
 * The queue split only isolates host resources (CPU, network, provider rate
 * limits) when this runs as its OWN process: production launches it as a
 * dedicated `worker low` service on the `worker-batch` node pool, separate from
 * `worker integration` on the webhook nodes, at `LOW_WORKER_CONCURRENCY`. The
 * image's `worker all` default (dev/fallback) runs every worker in one
 * container and does NOT provide that host-level isolation.
 *
 * Handlers are shared with the integration worker during the two-phase cutover
 * (integration still handles any jobs already queued under the old actions);
 * once that queue is drained, the integration-side cases are removed.
 *
 * This process also hosts the dedicated, rate-limited `profileSnapshot` consumer
 * (contact relationship snapshots) — non-urgent provider enrichment that must
 * not occupy the integration process.
 */
function startLowWorker() {
  createQueueWorker(
    queueNames.enum.low,
    async (job: Job<LowJobData>) => {
      try {
        await processLowJob(job)
      } finally {
        await settleMissedCommentReplay(job)
      }
    },
    { concurrency: env.LOW_WORKER_CONCURRENCY },
  )

  // Rate-limited provider enrichment (contact relationship snapshots). Its own
  // queue + limiter so the provider rate limit never throttles the shared
  // `low` jobs above; it runs here, off the latency-sensitive integration
  // process.
  createQueueWorker(
    queueNames.enum.profileSnapshot,
    async (job: Job<ProfileSnapshotJobData>) => {
      const workspaceId = job.data.data.workspaceId
      await withBlockedOwnerGuard(workspaceId, async () => {
        await runJobWithAuditContext(
          { workspaceId, source: `profile-snapshot:${job.data.type}` },
          async () => {
            await captureContactProfileSnapshot(job.data.data)
          },
        )
      })
    },
    {
      concurrency: 1,
      limiter: { max: env.PROFILE_SNAPSHOT_JOBS_PER_SECOND, duration: 1000 },
    },
  )

  // Leaderboard scoring: its own queue so a livestream burst never delays the
  // shared `low` jobs, with bounded concurrency so it cannot flood Postgres.
  createQueueWorker(
    queueNames.enum.leaderboard,
    async (job: Job<LeaderboardJobData>) => {
      const workspaceId = job.data.data.workspaceId
      await withBlockedOwnerGuard(workspaceId, async () => {
        await runJobWithAuditContext(
          { workspaceId, source: `leaderboard:${job.data.type}` },
          async () => {
            await processLeaderboardJob(job.data)
          },
        )
      })
    },
    { concurrency: env.LEADERBOARD_WORKER_CONCURRENCY },
  )
}

runWorker("low", startLowWorker)
