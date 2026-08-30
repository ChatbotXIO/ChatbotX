import {
  defaultWorkerOptions,
  getRedisConnection,
  HeavyJobAction,
  type HeavyJobData,
  queueNames,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { env } from "../env"
import { ensureBootstrapped } from "../lib/bootstrap"
import { isBlockedWorkspace } from "../lib/is-blocked-workspace"
import { logger } from "../lib/logger"
import { resolveWorkspaceId } from "../lib/resolve-workspace-id"
import { runJobWithAuditContext } from "../lib/run-job-with-audit-context"
import { coexistAttachmentDownload } from "./handlers/coexist/attachment-download"
import { coexistInstagramSync } from "./handlers/coexist/instagram-sync"
import { coexistMessengerSync } from "./handlers/coexist/messenger-sync"
import { coexistWhatsappBuffer } from "./handlers/coexist/whatsapp-buffer"
import { coexistWhatsappFlush } from "./handlers/coexist/whatsapp-flush"

async function startHeavyWorker() {
  try {
    await ensureBootstrapped()
  } catch (err) {
    logger.error({ err }, "Failed to bootstrap heavy worker")
    process.exit(1)
  }

  const worker = new Worker(
    queueNames.enum.heavy,
    async (job: Job<HeavyJobData>) => {
      const workspaceId = await resolveWorkspaceId(job.data.data)
      if (await isBlockedWorkspace(workspaceId)) {
        return
      }

      // No `runIntegrationJobWithWebhookContext` wrapper here — coexist
      // actions are never channel-originated (see
      // `apps/worker/src/integration/channel-origin.ts`), so the webhook
      // execution-context wrapper the integration worker uses has nothing to
      // do for this queue.
      return await runJobWithAuditContext(
        { workspaceId, source: `heavy:${job.data.type}` },
        async () => {
          switch (job.data.type) {
            case HeavyJobAction.coexistWhatsappBuffer: {
              await coexistWhatsappBuffer(job.data.data)
              return
            }
            case HeavyJobAction.coexistWhatsappFlush: {
              await coexistWhatsappFlush(job.data.data)
              return
            }
            case HeavyJobAction.coexistMessengerSync: {
              await coexistMessengerSync(job.data.data)
              return
            }
            case HeavyJobAction.coexistInstagramSync: {
              await coexistInstagramSync(job.data.data)
              return
            }
            case HeavyJobAction.coexistAttachmentDownload: {
              await coexistAttachmentDownload(job.data.data)
              return
            }
            default: {
              // Exhaustiveness guard — adding a new HeavyJobData variant
              // without handling it here becomes a compile error.
              const _exhaustive: never = job.data
              logger.warn({ data: _exhaustive }, "Unhandled heavy job type")
              return
            }
          }
        },
      )
    },
    {
      connection: getRedisConnection(),
      ...defaultWorkerOptions,
      // Env-tunable — coexist handlers also self-throttle via the BUC
      // adaptive throttle (usage-throttle.ts), so this is a coarse cap.
      concurrency: env.HEAVY_WORKER_CONCURRENCY,
      // Coexist historical sync chunks are bounded to ~4 min via
      // self-continuation (see coexist-messenger-sync / coexist-whatsapp-flush).
      // Lock sized as: 4 min active + 4 min Graph 5xx retry tail + 2 min bulk
      // INSERT tail.
      lockDuration: 10 * 60 * 1000,
      stalledInterval: 10 * 60 * 1000,
      maxStalledCount: 1,
    },
  )

  worker.on("failed", (job, err) => {
    if (job) {
      logger.error({ err }, `Job ${job.id} has failed`)
    }
  })

  let isShuttingDown = false
  async function shutdown() {
    if (isShuttingDown) {
      return
    }
    isShuttingDown = true
    try {
      // The moved coexist handlers hold no QueueEvents open (they don't await
      // chat or integration job completion), so — unlike the integration
      // worker — there is nothing else to close here.
      await worker.close()
      process.exit(0)
    } catch (err) {
      logger.error(err, "[HeavyWorker] Error during shutdown")
      process.exit(1)
    }
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}

startHeavyWorker().catch((err) => {
  logger.error({ err }, "Failed to start heavy worker")
  process.exit(1)
})
