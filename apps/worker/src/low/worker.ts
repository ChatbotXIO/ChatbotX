import { withBlockedOwnerGuard } from "@chatbotx.io/business"
import {
  defaultWorkerOptions,
  getRedisConnection,
  LowJobAction,
  type LowJobData,
  queueNames,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { env } from "../env"
import { coexistAttachmentDownload } from "../integration/handlers/coexist/attachment-download"
import { updateContactAvatar } from "../integration/handlers/contact/update-avatar"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"
import { runJobWithAuditContext } from "../lib/run-job-with-audit-context"

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
 */
async function startLowWorker() {
  try {
    await ensureBootstrapped()
  } catch (err) {
    logger.error({ err }, "Failed to bootstrap low worker")
    process.exit(1)
  }

  const worker = new Worker(
    queueNames.enum.low,
    async (job: Job<LowJobData>) => {
      const workspaceId = job.data.data.workspaceId
      await withBlockedOwnerGuard(workspaceId, async () => {
        await runJobWithAuditContext(
          { workspaceId, source: `low:${job.data.type}` },
          async () => {
            switch (job.data.type) {
              case LowJobAction.coexistAttachmentDownload: {
                await coexistAttachmentDownload(job.data.data)
                return
              }
              case LowJobAction.updateContactAvatar: {
                await updateContactAvatar(job.data.data)
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
    },
    {
      connection: getRedisConnection(),
      ...defaultWorkerOptions,
      concurrency: env.LOW_WORKER_CONCURRENCY,
    },
  )

  worker.on("failed", (job, err) => {
    if (job) {
      logger.error({ err }, `Low job ${job.id} has failed`)
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
      logger.error(err, "[LowWorker] Error during shutdown")
      process.exit(1)
    }
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}

startLowWorker().catch((err) => {
  logger.error({ err }, "Failed to start low worker")
  process.exit(1)
})
