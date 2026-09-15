import {
  callRecordingService,
  DEFAULT_RECORDING_CONTENT_TYPE,
  isAllowedRecordingContentType,
} from "@chatbotx.io/business"
import { whatsappCallRepository } from "@chatbotx.io/database/repositories"
import { setWebhookExecutionContext } from "@chatbotx.io/events"
import type { IntegrationJobWhatsappCallNativeRecordingFetch } from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import {
  AttachmentTooLargeError,
  downloadCallMedia,
  WhatsappCallMediaGoneError,
} from "./shared/whatsapp-call-native-media"
import { attachRecordingAndNotify } from "./whatsapp-call-recording"
import { resolveVoipAuthByInboxId } from "./whatsapp-voip-signaling"

/**
 * `callRecordingService.uploadRecording`'s `contentType` must be one of
 * `ALLOWED_RECORDING_CONTENT_TYPES` — Meta's webhook mime type arrives as a
 * full media-type string (e.g. `audio/ogg; codecs=opus`), so this strips
 * any parameters and falls back to the SIP-path default when the base type
 * isn't in the allow-list rather than throwing and losing an otherwise-good
 * recording.
 */
const normalizeRecordingContentType = (mimeType: string) => {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? ""
  return isAllowedRecordingContentType(base)
    ? base
    : DEFAULT_RECORDING_CONTENT_TYPE
}

/**
 * Meta-native call recording fetch: the
 * `call_recording_available` webhook only carries a media id + a ~5-min
 * lookaside URL, never the audio bytes — this handler downloads them
 * (preferring the media id, see `downloadCallMedia`), uploads to our object
 * storage via `callRecordingService`, then converges on the exact
 * create-message/broadcast/`emitCallRecorded` pipeline the SIP path uses
 * (`attachRecordingAndNotify`) so the activity card/message logic is not
 * duplicated. Unlike the SIP path, it never chains transcription — the
 * Meta-native transcript arrives independently via its own
 * `call_transcription_available` webhook/job, racing on a disjoint column.
 *
 * Idempotent: `call.recordedAt` already set (redelivery of the same
 * webhook, or `attachRecording`'s CAS having already won a race) short-
 * circuits before any download. On a genuine download failure within
 * Meta's 7-day retention window this throws so BullMQ retries; when the
 * call row or the media itself is gone, it logs and returns instead.
 */
export const handleWhatsappCallNativeRecordingFetch = async (
  data: IntegrationJobWhatsappCallNativeRecordingFetch["data"],
): Promise<void> => {
  // Channel-originated: without this, the WebhookEventEmitter's
  // isWebhookContext gate silently drops emitCallRecorded (see the same
  // override in whatsapp-call.ts / whatsapp-call-recording.ts).
  setWebhookExecutionContext({ source: "webhook" })

  const call = await whatsappCallRepository.findById(data.whatsappCallId)
  if (!call) {
    logger.warn(
      { whatsappCallId: data.whatsappCallId, wacid: data.wacid },
      "Whatsapp native call recording skipped: call row not found",
    )
    return
  }
  if (call.recordedAt) {
    logger.info(
      { whatsappCallId: data.whatsappCallId },
      "Whatsapp native call recording already processed; skipping",
    )
    return
  }

  logger.info(
    {
      whatsappCallId: data.whatsappCallId,
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
        { err: normalizeError(err), whatsappCallId: data.whatsappCallId },
        "Whatsapp native call recording: media no longer available; skipping",
      )
      return
    }
    if (err instanceof AttachmentTooLargeError) {
      logger.warn(
        { err: normalizeError(err), whatsappCallId: data.whatsappCallId },
        "Whatsapp native call recording: exceeds size cap; skipping (permanent)",
      )
      return
    }
    logger.error(
      { err: normalizeError(err), whatsappCallId: data.whatsappCallId },
      "Whatsapp native call recording download failed",
    )
    throw err
  }

  logger.info(
    {
      whatsappCallId: data.whatsappCallId,
      bytes: media.size,
      mimeType: media.mimeType,
    },
    "[wa-call-recording] media downloaded (uploading + attaching)",
  )

  const resolvedMimeType = media.mimeType || data.mimeType
  const { recordingPath } = await callRecordingService.uploadRecording({
    callId: data.whatsappCallId,
    workspaceId: data.workspaceId,
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
    { whatsappCallId: data.whatsappCallId, recordingPath },
    "[wa-call-recording] DONE (recording attached + message enriched)",
  )
}
