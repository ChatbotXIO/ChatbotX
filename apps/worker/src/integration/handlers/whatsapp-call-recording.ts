import {
  broadcastToWorkspaceParty,
  callRecordingService,
  contactInboxService,
} from "@chatbotx.io/business"
import {
  createMessageRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import {
  emitCallRecorded,
  setWebhookExecutionContext,
} from "@chatbotx.io/events"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import { createId } from "@chatbotx.io/utils"
import {
  callTranscriptionJobId,
  callTranscriptionQueue,
  type IntegrationJobWhatsappCallRecordingReady,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"

const DEFAULT_RECORDING_MIME_TYPE = "audio/ogg"

/**
 * The provider-facing id events/messages should quote externally — never the
 * DB `WhatsappCall.id`: external correlation is exposed as
 * `correlationId = wacid ?? attemptId` in events, never as `callId`.
 */
const externalCorrelationId = (call: {
  wacid: string | null
  attemptId: string | null
  id: string
}): string => call.wacid ?? call.attemptId ?? call.id

/**
 * A FreeSWITCH call recording finished uploading to object storage:
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
  // isWebhookContext() gate silently drops emitCallRecorded (see the same
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

  // recordedAt is stamped LAST (below): it marks "post-processing done", so a
  // transient failure mid-pipeline retries the whole handler instead of being
  // permanently swallowed. Each step below is individually replay-safe.
  if (call.recordedAt) {
    logger.info(
      { callId: data.callId },
      "Whatsapp call recording already processed; re-chaining transcription only",
    )
    // The transcription enqueue is the last step below; a crash between the
    // durable `attachRecording` and that enqueue must not strand the call
    // without a transcript. Deterministic jobId → a duplicate is a no-op.
    await enqueueTranscription(data.callId, call.workspaceId)
    return
  }

  const repository = await createMessageRepository()
  const { result: message, isNew } =
    await repository.createOrUpdateWithAttachments(
      {
        id: createId(),
        conversationId: call.conversationId,
        contactInboxId: call.contactInboxId,
        workspaceId: call.workspaceId,
        // One audio message per call recording, replay-safe.
        sourceId: `wacall-rec-${data.callId}`,
        senderType: "system",
        senderId: null,
        messageType: "activity",
        text: null,
        contentType: "text",
        contentAttributes: {
          type: "whatsapp_call_recording",
          callId: data.callId,
        },
        createdAt: new Date(),
      },
      [
        {
          conversationId: call.conversationId,
          workspaceId: call.workspaceId,
          fileType: "audio",
          mimeType: data.mimeType ?? DEFAULT_RECORDING_MIME_TYPE,
          originPath: data.recordingPath,
          size: data.sizeBytes,
        },
      ],
    )

  // Broadcast + event fire once, keyed to the winning message insert — a
  // retry that found the message already created must not duplicate them
  // (same pattern as the terminate handler).
  if (isNew) {
    try {
      const attachments = await Promise.all(
        message.attachments.map(async (attachment) => ({
          ...attachment,
          url: await callRecordingService.getRecordingSignedUrl({
            recordingPath: attachment.originPath,
          }),
        })),
      )
      await broadcastToWorkspaceParty(call.workspaceId, {
        eventType: RealtimeEventType.messageCreated,
        data: { ...message, attachments },
      })
    } catch (error) {
      logger.warn(
        { err: error, callId: data.callId },
        "Whatsapp call recording: unable to emit realtime event",
      )
    }

    const contactInbox = await contactInboxService.findBy({
      where: { id: call.contactInboxId },
    })
    if (contactInbox) {
      const recordingUrl = await callRecordingService.getRecordingSignedUrl({
        recordingPath: data.recordingPath,
      })
      await emitCallRecorded(call.workspaceId, contactInbox.contactId, {
        callId: externalCorrelationId(call),
        recordingUrl,
      })
    }
  }

  // Stamp the recording BEFORE chaining transcription: the transcribe
  // handler reads `recordingPath` off the row, so enqueueing first would let
  // a fast transcription worker find no path and skip the call for good.
  // The CAS on `recordedAt IS NULL` keeps a redelivery a no-op.
  await whatsappCallRepository.attachRecording({
    id: data.callId,
    recordingPath: data.recordingPath,
    recordedAt: new Date(),
  })

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
