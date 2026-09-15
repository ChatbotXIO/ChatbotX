import {
  callRecordingService,
  contactInboxService,
  whatsappCallLifecycleService,
} from "@chatbotx.io/business"
import {
  createMessageRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import type { WhatsappCallModel } from "@chatbotx.io/database/types"
import {
  emitCallRecorded,
  setWebhookExecutionContext,
} from "@chatbotx.io/events"
import { createId } from "@chatbotx.io/utils"
import {
  callTranscriptionJobId,
  callTranscriptionQueue,
  type IntegrationJobWhatsappCallRecordingReady,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import {
  enrichCallActivityMessage,
  waitUntilReady,
} from "./shared/whatsapp-call-finalize"

const DEFAULT_RECORDING_MIME_TYPE = "audio/ogg"

/**
 * The provider-facing id events/messages should quote externally — never the
 * DB `WhatsappCall.id`: external correlation is exposed as
 * `correlationId = wacid ?? attemptId` in events, never as `callId`.
 *
 * Exported so the Meta-native recording/transcript fetch handlers reuse the
 * exact same correlation rule rather than each keeping their own copy.
 */
export const externalCorrelationId = (call: {
  wacid: string | null
  attemptId: string | null
  id: string
}): string => call.wacid ?? call.attemptId ?? call.id

/**
 * Stamps `recordedAt` via the CAS `attachRecording`, attaches the recording
 * as an `audio` attachment on the EXISTING finalize `whatsapp_call` message
 * (never a second message), then enriches that
 * message's flags (`hasRecording: true`) and fires `callRecorded` — the
 * exact pipeline both the browserWhisper (`handleWhatsappCallRecordingReady`)
 * and Meta-native (`handleWhatsappCallNativeRecordingFetch`) paths converge
 * on once the recording bytes are safely in object storage, so neither keeps
 * its own copy of the attach/enrich/emit logic. The CAS on
 * `attachRecording` (`recordedAt IS NULL`) is what makes this idempotent —
 * a redelivery that loses the race returns `undefined` and this is a no-op,
 * since the winning call already did the enrichment/attachment/emit. Never
 * chains transcription — callers decide that themselves (browserWhisper
 * always chains Whisper; Meta-native never does, since its transcript
 * arrives via its own independent webhook/job).
 *
 * `stamped.messageId`/`endedAt` (stamped by `finalizeCallSideEffects`) can
 * still be null right after the CAS wins if this recording webhook's
 * post-processing reached us before that finalize write landed - the same
 * race `enrichCallActivityMessage` waits out below. `attachRecording`'s CAS
 * above is one-time (`recordedAt IS NULL`), so a caller-level BullMQ retry
 * of the OUTER job can never re-reach this function for the same call -
 * the bounded wait via `waitUntilReady` is the only chance to attach the
 * audio to the right message instead of silently dropping it forever.
 */
export const attachRecordingAndNotify = async (props: {
  call: WhatsappCallModel
  recordingPath: string
  mimeType?: string
  sizeBytes?: number
}): Promise<void> => {
  const { call, recordingPath, mimeType, sizeBytes } = props
  if (call.recordedAt) {
    return
  }

  const stamped = await whatsappCallLifecycleService.attachRecording({
    id: call.id,
    recordingPath,
    recordedAt: new Date(),
  })
  if (!stamped) {
    // Lost the CAS to a concurrent redelivery — the winning call already
    // did the attachment/enrichment/emit below.
    return
  }

  const finalized = await waitUntilReady(
    () => whatsappCallRepository.findById(call.id),
    (row) => Boolean(row?.messageId && row?.endedAt),
  )

  if (finalized?.messageId && finalized.endedAt) {
    const repository = await createMessageRepository()
    await repository.bulkCreateAttachments([
      {
        id: createId(),
        workspaceId: call.workspaceId,
        conversationId: call.conversationId,
        fileType: "audio",
        mimeType: mimeType ?? DEFAULT_RECORDING_MIME_TYPE,
        messageId: finalized.messageId,
        messageCreatedAt: finalized.endedAt,
        originPath: recordingPath,
        size: sizeBytes,
      },
    ])
  } else {
    logger.warn(
      { callId: call.id },
      "Whatsapp call recording: finalize message still not found after bounded wait; attachment not attached",
    )
  }

  await enrichCallActivityMessage({
    call: stamped,
    overrides: { hasRecording: true },
  })

  const contactInbox = await contactInboxService.findBy({
    where: { id: call.contactInboxId },
  })
  if (contactInbox) {
    const recordingUrl = await callRecordingService.getRecordingSignedUrl({
      recordingPath,
    })
    await emitCallRecorded(call.workspaceId, contactInbox.contactId, {
      callId: externalCorrelationId(call),
      recordingUrl,
    })
  }
}

/**
 * A browser-captured call recording finished uploading to object storage:
 * stamp it onto the call, drop an audio message into the conversation, fire
 * the callRecorded event, and chain transcription. Every step is idempotent
 * against redeliveries (attachRecording no-ops when already set; the audio
 * message dedups on its sourceId). Looked up by the DB `callId` —
 * never by wacid, so an outbound call with no wacid yet still resolves.
 */
export const handleWhatsappCallRecordingReady = async (
  data: IntegrationJobWhatsappCallRecordingReady["data"],
): Promise<void> => {
  // Channel-originated: without this, the WebhookEventEmitter's
  // isWebhookContext gate silently drops emitCallRecorded (see the same
  // override in whatsapp-call.ts).
  setWebhookExecutionContext({ source: "webhook" })
  const call = await whatsappCallRepository.findById(data.callId)
  if (!call) {
    logger.warn(
      { callId: data.callId },
      "Whatsapp call recording skipped: call row not found",
    )
    return
  }

  // recordedAt is stamped inside attachRecordingAndNotify: it marks
  // "post-processing done", so a transient failure mid-pipeline retries the
  // whole handler instead of being permanently swallowed. Each step is
  // individually replay-safe.
  if (call.recordedAt) {
    logger.info(
      { callId: data.callId },
      "Whatsapp call recording already processed; re-chaining transcription only",
    )
  } else {
    await attachRecordingAndNotify({
      call,
      recordingPath: data.recordingPath,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
    })
  }

  // The transcription enqueue always runs last, in both branches: a crash
  // between the durable `attachRecording` and this enqueue must not strand
  // the call without a transcript. Deterministic jobId → a duplicate is a
  // no-op.
  await enqueueTranscription(data.callId, call.workspaceId)
}

/**
 * Deterministic jobId — replay-safe. Dedicated queue so a
 * limiter can bound transcription throughput independent of the shared
 * `integration` queue's traffic.
 */
const enqueueTranscription = async (
  callId: string,
  workspaceId: string,
): Promise<void> => {
  await callTranscriptionQueue.add(
    "transcribeCall",
    {
      type: "transcribeCall",
      data: { channel: "whatsapp", callId, workspaceId },
    },
    { jobId: callTranscriptionJobId(callId) },
  )
}
