import {
  LowJobAction,
  type LowJobCoexistAttachmentDownload,
  lowQueue,
} from "@chatbotx.io/worker-config"

type AttachmentDownloadChannel =
  LowJobCoexistAttachmentDownload["data"]["channel"]

/**
 * Bulk-enqueue one `coexistAttachmentDownload` job per Attachment id onto the
 * low-priority `low` queue — kept off the latency-sensitive `integration` queue
 * so a historical-import burst never starves customer replies.
 *
 * Channel-agnostic: the caller passes its `channel`, so the Messenger, Instagram
 * and WhatsApp coexist syncs share one enqueue path instead of each duplicating
 * the same job shape/options. Idempotent — the jobId `att-<id>` dedups concurrent
 * enqueues and the handler prefix-checks `originPath`, so re-enqueuing the same
 * id is harmless.
 *
 * This builds and enqueues only; it does NOT catch. Each caller keeps its own
 * failure policy: WhatsApp/Messenger swallow (best-effort — bytes stay pending,
 * a later sync re-enqueues) while Instagram lets it propagate so the run fails
 * and re-drives before the resume watermark advances past un-enqueued
 * attachments.
 */
export const enqueueAttachmentDownloadJobs = async (input: {
  workspaceId: string
  integrationId: string
  channel: AttachmentDownloadChannel
  attachmentIds: string[]
}): Promise<void> => {
  const { workspaceId, integrationId, channel, attachmentIds } = input
  if (attachmentIds.length === 0) {
    return
  }

  await lowQueue.addBulk(
    attachmentIds.map((attachmentId) => ({
      name: LowJobAction.coexistAttachmentDownload,
      data: {
        type: LowJobAction.coexistAttachmentDownload,
        data: { attachmentId, workspaceId, channel, integrationId },
      },
      opts: {
        jobId: `att-${attachmentId}`,
        attempts: 5,
        backoff: { type: "exponential" as const, delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: { count: 100 },
      },
    })),
  )
}
