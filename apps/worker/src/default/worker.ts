import { flushAllPendingWorkspaceRealtimeEvents } from "@chatbotx.io/business"
import {
  DefaultJobAction,
  type DefaultJobData,
  defaultWorkerOptions,
  getQueueConnection,
  queueNames,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { ensureBootstrapped } from "../lib/bootstrap"
import { isBlockedWorkspace } from "../lib/is-blocked-workspace"
import { logger } from "../lib/logger"
import { resolveWorkspaceId } from "../lib/resolve-workspace-id"
import { runJobWithAuditContext } from "../lib/run-job-with-audit-context"
import { onShutdown, runWorker } from "../lib/shutdown"
import { handleBulkTagContacts } from "./handlers/bulk-tag-contacts"
import { loopableExportContacts } from "./handlers/export-contacts"
import { exportCoupons } from "./handlers/export-coupons"
import { exportLeaderboardParticipants } from "./handlers/export-leaderboard-participants"
import { installTemplate } from "./handlers/install-template"
import { checkMetaCatalogSync } from "./handlers/meta-catalog/check"
import { importMetaCatalogProducts } from "./handlers/meta-catalog/import-products"
import { submitMetaCatalogSync } from "./handlers/meta-catalog/submit"
import {
  processPipelineStageBulk,
  releasePipelineStageBulkClaim,
} from "./handlers/pipeline-stage-bulk"
import {
  processInboundWebhookRequest,
  skipBlockedInboundWebhookRequest,
} from "./handlers/process-inbound-webhook-request"
import { retryRealtimeMemberRevoke } from "./handlers/retry-realtime-member-revoke"
import { runImport } from "./handlers/run-import"
import { sendAppointmentReminder } from "./handlers/send-appointment-reminder"
import { sendAuditLog } from "./handlers/send-audit-log"
import { handleSyncChannelLabels } from "./handlers/sync-channel-labels"
import { syncExternalCalendarEvent } from "./handlers/sync-external-calendar-event"
import { handleSyncTag } from "./handlers/sync-tag"
import {
  deleteWelcomeMessageFlows,
  syncWelcomeMessageFlows,
} from "./handlers/welcome-message-flows"

async function runGuardedDefaultJob<T>(
  data: unknown,
  auditParams: {
    source: string
    requestedUserId?: string
    ipAddress?: string
    userAgent?: string
  },
  handler: () => Promise<T>,
  // For jobs backed by a durable row that must leave its pending set when the
  // owner is blocked, or a re-dispatch scan keeps re-finding it.
  onBlocked?: () => Promise<void>,
): Promise<T | undefined> {
  const workspaceId = await resolveWorkspaceId(data)
  if (await isBlockedWorkspace(workspaceId)) {
    await onBlocked?.()
    return
  }
  return runJobWithAuditContext({ workspaceId, ...auditParams }, handler)
}

async function startDefaultWorker() {
  try {
    await ensureBootstrapped()
    logger.info("Default worker bootstrapped successfully")
  } catch (err) {
    logger.error(err, "Failed to bootstrap default worker")
    throw err
  }

  const worker = new Worker(
    queueNames.enum.default,
    async (job: Job<DefaultJobData>) => {
      logger.info(job.data, `Worker received job: ${job.id}`)

      switch (job.data.type) {
        case DefaultJobAction.sendAuditLog:
          await sendAuditLog(job.data.data)
          return
        case DefaultJobAction.exportContacts: {
          const { type, data } = job.data
          await runGuardedDefaultJob(data, { source: `default:${type}` }, () =>
            loopableExportContacts(data),
          )
          return
        }
        case DefaultJobAction.exportCoupons: {
          const { type, data } = job.data
          await runGuardedDefaultJob(data, { source: `default:${type}` }, () =>
            exportCoupons(data),
          )
          return
        }
        case DefaultJobAction.exportLeaderboardParticipants: {
          const { type, data } = job.data
          await runGuardedDefaultJob(data, { source: `default:${type}` }, () =>
            exportLeaderboardParticipants(data),
          )
          return
        }
        case DefaultJobAction.bulkTagContacts: {
          const { type, data } = job.data
          await runGuardedDefaultJob(
            data,
            {
              source: `default:${type}`,
              requestedUserId: data.requestedUserId,
            },
            () =>
              handleBulkTagContacts(data, { attemptsMade: job.attemptsMade }),
          )
          return
        }
        case DefaultJobAction.runImport: {
          const { type, data } = job.data
          await runGuardedDefaultJob(
            data,
            {
              source: `default:${type}`,
              ipAddress: data.ipAddress,
              userAgent: data.userAgent,
            },
            () => runImport(data),
          )
          return
        }
        case DefaultJobAction.syncTag: {
          const { type, data } = job.data
          await runGuardedDefaultJob(data, { source: `default:${type}` }, () =>
            handleSyncTag(data),
          )
          return
        }
        case DefaultJobAction.syncChannelLabels: {
          const { type, data } = job.data
          await runGuardedDefaultJob(data, { source: `default:${type}` }, () =>
            handleSyncChannelLabels(data),
          )
          return
        }
        case DefaultJobAction.submitMetaCatalogSync: {
          const { type, data } = job.data
          await runGuardedDefaultJob(data, { source: `default:${type}` }, () =>
            submitMetaCatalogSync(data),
          )
          return
        }
        case DefaultJobAction.importMetaCatalogProducts: {
          const { type, data } = job.data
          await runGuardedDefaultJob(data, { source: `default:${type}` }, () =>
            importMetaCatalogProducts(data),
          )
          return
        }
        case DefaultJobAction.checkMetaCatalogSync: {
          const { type, data } = job.data
          await runGuardedDefaultJob(data, { source: `default:${type}` }, () =>
            checkMetaCatalogSync(data),
          )
          return
        }
        case DefaultJobAction.syncExternalCalendarEvent: {
          const { type, data } = job.data
          await runGuardedDefaultJob(data, { source: `default:${type}` }, () =>
            syncExternalCalendarEvent(data, job),
          )
          return
        }
        case DefaultJobAction.sendAppointmentReminder: {
          const { type, data } = job.data
          await runGuardedDefaultJob(data, { source: `default:${type}` }, () =>
            sendAppointmentReminder(data),
          )
          return
        }
        case DefaultJobAction.installTemplate: {
          const { type, data } = job.data
          await runGuardedDefaultJob(data, { source: `default:${type}` }, () =>
            installTemplate(data),
          )
          return
        }
        case DefaultJobAction.processInboundWebhookRequest: {
          const { type, data } = job.data
          await runGuardedDefaultJob(
            data,
            { source: `default:${type}` },
            () => processInboundWebhookRequest(data, job),
            () => skipBlockedInboundWebhookRequest(data),
          )
          return
        }
        case DefaultJobAction.syncWelcomeMessageFlows: {
          const { type, data } = job.data
          await runGuardedDefaultJob(data, { source: `default:${type}` }, () =>
            syncWelcomeMessageFlows(data),
          )
          return
        }
        case DefaultJobAction.deleteWelcomeMessageFlows: {
          const { type, data } = job.data
          await runGuardedDefaultJob(data, { source: `default:${type}` }, () =>
            deleteWelcomeMessageFlows(data),
          )
          return
        }
        case DefaultJobAction.processPipelineStageBulk: {
          const { type, data } = job.data
          await runGuardedDefaultJob(
            data,
            {
              source: `default:${type}`,
              requestedUserId: data.actorUserId ?? undefined,
            },
            () => processPipelineStageBulk(data),
            // A blocked owner skips the job; the stage must not stay claimed
            // (hidden from writers) forever.
            () => releasePipelineStageBulkClaim(data),
          )
          return
        }
        case DefaultJobAction.retryRealtimeMemberRevoke: {
          const { type, data } = job.data
          await runGuardedDefaultJob(
            data,
            { source: `default:${type}` },
            async () => {
              try {
                await retryRealtimeMemberRevoke(data)
              } catch (err) {
                if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
                  logger.error(
                    { err, userId: data.userId, workspaceId: data.workspaceId },
                    "Realtime member connection revoke retry exhausted",
                  )
                }
                throw err
              }
            },
          )
          return
        }
        default:
          logger.warn(`Unknown job name: ${job.name}`)
          return
      }
    },
    {
      connection: getQueueConnection(queueNames.enum.default),
      ...defaultWorkerOptions,
    },
  )

  worker.on("failed", (job, err) => {
    if (!job) {
      return
    }
    // Logged only. This used to write an `ErrorLog` row for every failed job,
    // but `ErrorLog` records third-party API failures and most default-queue
    // jobs (exportContacts, runImport, installTemplate, …) never call one. The
    // six jobs that do call a third party log explicitly in their own handlers,
    // where the provider is actually knowable — `syncTag` alone hits both
    // Messenger and Zalo, which no single catch-all label could attribute.
    logger.error(err, `Job ${job.id} has failed`)
  })

  onShutdown("default", async () => {
    try {
      await worker.close()
    } finally {
      await flushAllPendingWorkspaceRealtimeEvents()
    }
  })
}

runWorker("default", startDefaultWorker)
