import {
  ensureAttachmentMirrored,
  markAttachmentUnresolvable,
  restoreMirroredAttachment,
  TerminalMediaError,
} from "@chatbotx.io/channel-registry/media-hydration"
import type { LowJobCoexistAttachmentDownload } from "@chatbotx.io/worker-config"
import type { Job } from "bullmq"
import { logger } from "../../../lib/logger"

export {
  AttachmentTooLargeError,
  type DownloadedMedia,
  downloadBearerUrlMedia,
  downloadWhatsappMedia,
  MAX_ATTACHMENT_BYTES,
  readBodyWithCap,
} from "@chatbotx.io/channel-registry/media-hydration"

type AttachmentDownloadJob = Pick<Job, "attemptsMade" | "opts">

export const markUnresolvableOnFinalAttempt = async (
  job: AttachmentDownloadJob,
  data: LowJobCoexistAttachmentDownload["data"],
): Promise<void> => {
  const attempts = job.opts.attempts ?? 1
  if (job.attemptsMade + 1 < attempts) {
    return
  }

  await markAttachmentUnresolvable({
    attachmentId: data.attachmentId,
    workspaceId: data.workspaceId,
  })
}

// Restoring an evicted object never changes the row, so a failure — even on
// the final attempt — must not mark it unresolvable: the next view retries.
const restoreEvictedAttachment = async (
  data: LowJobCoexistAttachmentDownload["data"],
): Promise<void> => {
  try {
    await restoreMirroredAttachment({
      attachmentId: data.attachmentId,
      workspaceId: data.workspaceId,
      ...(data.messageCreatedAt === undefined
        ? {}
        : { messageCreatedAt: new Date(data.messageCreatedAt) }),
    })
  } catch (err) {
    if (err instanceof TerminalMediaError) {
      logger.warn(
        { err, attachmentId: data.attachmentId, channel: data.channel },
        "[coexist-attachment] terminal media failure — skipping restore",
      )
      return
    }
    logger.error(
      { err, attachmentId: data.attachmentId, channel: data.channel },
      "[coexist-attachment] restore failed",
    )
    throw err
  }
}

export const coexistAttachmentDownload = async (
  job: AttachmentDownloadJob,
  data: LowJobCoexistAttachmentDownload["data"],
): Promise<void> => {
  if (data.restore) {
    await restoreEvictedAttachment(data)
    return
  }
  try {
    await ensureAttachmentMirrored({
      attachmentId: data.attachmentId,
      workspaceId: data.workspaceId,
    })
  } catch (err) {
    if (err instanceof TerminalMediaError) {
      logger.warn(
        { err, attachmentId: data.attachmentId, channel: data.channel },
        "[coexist-attachment] terminal media failure — skipping",
      )
      return
    }
    try {
      await markUnresolvableOnFinalAttempt(job, data)
    } catch (markErr) {
      logger.error(
        {
          err: markErr,
          attachmentId: data.attachmentId,
          channel: data.channel,
        },
        "[coexist-attachment] failed to mark unresolvable",
      )
    }
    logger.error(
      { err, attachmentId: data.attachmentId, channel: data.channel },
      "[coexist-attachment] hydration failed",
    )
    throw err
  }
}
