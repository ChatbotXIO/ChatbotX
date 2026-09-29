import {
  ensureAttachmentMirrored,
  markAttachmentUnresolvable,
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

export const coexistAttachmentDownload = async (
  job: AttachmentDownloadJob,
  data: LowJobCoexistAttachmentDownload["data"],
): Promise<void> => {
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
