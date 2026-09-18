import {
  callRecordingService,
  DEFAULT_RECORDING_CONTENT_TYPE,
  isAllowedRecordingContentType,
} from "@chatbotx.io/business"
import { whatsappCallRepository } from "@chatbotx.io/database/repositories"
import { setWebhookExecutionContext } from "@chatbotx.io/events"
import type { IntegrationJobWhatsappCallNativeRecordingFetch } from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { isBlockedWorkspace } from "../../lib/is-blocked-workspace"
import { logger } from "../../lib/logger"
import {
  AttachmentTooLargeError,
  downloadCallMedia,
  WhatsappCallMediaGoneError,
  WhatsappCallRowNotReadyError,
} from "./shared/whatsapp-call-native-media"
import { attachRecordingAndNotify } from "./whatsapp-call-recording"
import { resolveVoipAuthByInboxId } from "./whatsapp-voip-signaling"

/**
 * Meta's webhook mime type arrives as a full media-type string (e.g. audio/ogg;
 * codecs=opus); strips parameters and falls back to the browserWhisper-path
 * default when the base type isn't in ALLOWED_RECORDING_CONTENT_TYPES, rather
 * than throwing and losing an otherwise-good recording.
 */
const normalizeRecordingContentType = (mimeType: string) => {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? ""
  return isAllowedRecordingContentType(base)
    ? base
    : DEFAULT_RECORDING_CONTENT_TYPE
}

/**
 * The call_recording_available webhook carries only a media id and a ~5-min
 * lookaside URL, never audio bytes — downloads them and feeds the same
 * create-message/broadcast/emitCallRecorded pipeline browserWhisper uses.
 * Never chains transcription; that arrives independently on its own webhook.
 * Idempotent via call.recordedAt CAS. Missing media logs and returns; a
 * failure within Meta's 7-day retention window throws to let BullMQ retry.
 * The row may not exist yet (races the row-creating webhook/job) — always
 * re-resolves by data.wacid and throws WhatsappCallRowNotReadyError
 * (retryable, ~1h) rather than silently dropping the event.
 */
export const handleWhatsappCallNativeRecordingFetch = async (
  data: IntegrationJobWhatsappCallNativeRecordingFetch["data"],
): Promise<void> => {
  // Channel-originated: without this, WebhookEventEmitter's isWebhookContext
  // gate silently drops emitCallRecorded (same override in whatsapp-call.ts /
  // whatsapp-call-recording.ts).
  setWebhookExecutionContext({ source: "webhook" })

  const byId = data.whatsappCallId
    ? await whatsappCallRepository.findById(data.whatsappCallId)
    : undefined
  const call = byId ?? (await whatsappCallRepository.findByWacid(data.wacid))
  if (!call) {
    logger.warn(
      { whatsappCallId: data.whatsappCallId, wacid: data.wacid },
      "[wa-call-recording] call row not found yet; retrying",
    )
    throw new WhatsappCallRowNotReadyError(data.wacid)
  }
  // A job enqueued before its row existed carries no workspaceId, so the
  // worker-level blocked-owner gate couldn't resolve it - apply it here now
  // that the row (and workspace) is known.
  if (!data.workspaceId && (await isBlockedWorkspace(call.workspaceId))) {
    logger.info(
      { whatsappCallId: call.id, workspaceId: call.workspaceId },
      "[wa-call-recording] skipped: blocked workspace",
    )
    return
  }
  if (call.recordedAt) {
    logger.info(
      { whatsappCallId: call.id },
      "[wa-call-recording] already processed; skipping",
    )
    return
  }

  logger.info(
    {
      whatsappCallId: call.id,
      wacid: data.wacid,
      audioMediaId: data.audioMediaId,
      hasAudioUrl: Boolean(data.audioUrl),
      mimeType: data.mimeType,
    },
    "[wa-call-recording] fetch job START (downloading media)",
  )

  let media: Awaited<ReturnType<typeof downloadCallMedia>>
  try {
    const auth = await resolveVoipAuthByInboxId(call.inboxId)
    media = await downloadCallMedia({
      mediaId: data.audioMediaId,
      url: data.audioUrl,
      auth,
      fallbackMime: data.mimeType,
      label: "call recording",
    })
  } catch (err) {
    if (err instanceof WhatsappCallMediaGoneError) {
      logger.warn(
        { err: normalizeError(err), whatsappCallId: call.id },
        "[wa-call-recording] media no longer available; skipping",
      )
      return
    }
    if (err instanceof AttachmentTooLargeError) {
      logger.warn(
        { err: normalizeError(err), whatsappCallId: call.id },
        "[wa-call-recording] exceeds size cap; skipping (permanent)",
      )
      return
    }
    logger.error(
      { err: normalizeError(err), whatsappCallId: call.id },
      "[wa-call-recording] download failed",
    )
    throw err
  }

  logger.info(
    {
      whatsappCallId: call.id,
      bytes: media.size,
      mimeType: media.mimeType,
    },
    "[wa-call-recording] media downloaded (uploading + attaching)",
  )

  const resolvedMimeType = media.mimeType || data.mimeType
  const { recordingPath } = await callRecordingService.uploadRecording({
    callId: call.id,
    workspaceId: call.workspaceId,
    body: new Uint8Array(media.bytes),
    contentType: normalizeRecordingContentType(resolvedMimeType),
  })

  await attachRecordingAndNotify({
    call,
    recordingPath,
    mimeType: resolvedMimeType,
    sizeBytes: media.size,
  })

  logger.info(
    { whatsappCallId: call.id, recordingPath },
    "[wa-call-recording] DONE (recording attached + message enriched)",
  )
}
