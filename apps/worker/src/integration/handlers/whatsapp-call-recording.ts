import { aiTimeouts } from "@chatbotx.io/ai"
import { aiIntegrationService, getAIModel } from "@chatbotx.io/ai/server"
import {
  broadcastToWorkspaceParty,
  contactInboxService,
  resolveTenantSettings,
} from "@chatbotx.io/business"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import {
  createMessageRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import { emitCallRecorded, emitCallTranscribed } from "@chatbotx.io/events"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import { createId } from "@chatbotx.io/utils"
import {
  IntegrationJobAction,
  type IntegrationJobWhatsappCallRecordingReady,
  type IntegrationJobWhatsappCallTranscribe,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { experimental_transcribe as transcribe } from "ai"
import ky from "ky"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"

const DEFAULT_RECORDING_MIME_TYPE = "audio/ogg"
const TRANSCRIPTION_MODEL = "whisper-1"

const toBullMqSafeIdSegment = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]/g, "_")

/**
 * A LiveKit egress finished and the recording file is in object storage:
 * stamp it onto the call, drop an audio message into the conversation, fire
 * the callRecorded event, and chain transcription. Every step is idempotent
 * against webhook redeliveries (attachRecording no-ops when already set;
 * the audio message dedups on its sourceId).
 */
export const handleWhatsappCallRecordingReady = async (
  data: IntegrationJobWhatsappCallRecordingReady["data"],
): Promise<void> => {
  const call = await whatsappCallRepository.findByWacid(data.wacid)
  if (!call) {
    logger.warn(
      { wacid: data.wacid },
      "Whatsapp call recording skipped: call row not found",
    )
    return
  }

  const stamped = await whatsappCallRepository.attachRecording({
    wacid: data.wacid,
    recordingPath: data.recordingPath,
    recordedAt: new Date(),
  })
  if (!stamped) {
    logger.info(
      { wacid: data.wacid },
      "Whatsapp call recording already stamped; skipping",
    )
    return
  }

  const { storageUrl } = await resolveTenantSettings({
    workspaceId: call.workspaceId,
  })

  const repository = await createMessageRepository()
  const { result: message } = await repository.createOrUpdateWithAttachments(
    {
      id: createId(),
      conversationId: call.conversationId,
      contactInboxId: call.contactInboxId,
      workspaceId: call.workspaceId,
      // One audio message per call recording, replay-safe.
      sourceId: `wacall-rec-${data.wacid}`,
      senderType: "system",
      senderId: null,
      messageType: "activity",
      text: null,
      contentType: "text",
      contentAttributes: { type: "whatsapp_call_recording", wacid: data.wacid },
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

  try {
    broadcastToWorkspaceParty(call.workspaceId, {
      eventType: RealtimeEventType.messageCreated,
      data: {
        ...message,
        attachments: message.attachments.map((attachment) => ({
          ...attachment,
          url: getPublicFileUrl(attachment.originPath, storageUrl),
        })),
      },
    })
  } catch (error) {
    logger.warn(
      { err: error, wacid: data.wacid },
      "Whatsapp call recording: unable to emit realtime event",
    )
  }

  const contactInbox = await contactInboxService.findBy({
    where: { id: call.contactInboxId },
  })
  if (contactInbox) {
    await emitCallRecorded(call.workspaceId, contactInbox.contactId, {
      wacid: data.wacid,
      recordingUrl: getPublicFileUrl(data.recordingPath, storageUrl),
    })
  }

  await integrationQueue.add(
    IntegrationJobAction.whatsappCallTranscribe,
    {
      type: IntegrationJobAction.whatsappCallTranscribe,
      data: { wacid: data.wacid, workspaceId: call.workspaceId },
    },
    { jobId: `wa-call-transcribe-${toBullMqSafeIdSegment(data.wacid)}` },
  )
}

/**
 * Speech-to-text over a stored call recording. Requires the workspace's
 * OpenAI integration; silently skips (no retry) when it is absent — the
 * recording itself is already saved and usable.
 */
export const handleWhatsappCallTranscribe = async (
  data: IntegrationJobWhatsappCallTranscribe["data"],
): Promise<void> => {
  const call = await whatsappCallRepository.findByWacid(data.wacid)
  if (!call?.recordingPath) {
    logger.warn(
      { wacid: data.wacid },
      "Whatsapp call transcription skipped: no recording",
    )
    return
  }
  if (call.transcript) {
    return
  }

  const aiConfig = await aiIntegrationService.findBy({
    workspaceId: call.workspaceId,
    provider: "openai",
  })
  if (!aiConfig) {
    logger.info(
      { wacid: data.wacid, workspaceId: call.workspaceId },
      "Whatsapp call transcription skipped: no OpenAI integration",
    )
    return
  }

  const openaiProvider = getAIModel(aiConfig, "openai")
  if (!("transcription" in openaiProvider)) {
    logger.warn(
      { wacid: data.wacid },
      "Whatsapp call transcription skipped: provider lacks transcription",
    )
    return
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)
  try {
    const { storageUrl } = await resolveTenantSettings({
      workspaceId: call.workspaceId,
    })
    const audioBuffer = await ky
      .get(getPublicFileUrl(call.recordingPath, storageUrl), {
        signal: controller.signal,
      })
      .arrayBuffer()

    const transcript = await transcribe({
      model: openaiProvider.transcription(TRANSCRIPTION_MODEL),
      audio: new Uint8Array(audioBuffer),
      abortSignal: controller.signal,
    })

    if (!transcript.text.trim()) {
      logger.info(
        { wacid: data.wacid },
        "Whatsapp call transcription produced empty text; not stamping",
      )
      return
    }

    const stamped = await whatsappCallRepository.attachTranscript({
      wacid: data.wacid,
      transcript: transcript.text,
      transcribedAt: new Date(),
    })
    if (!stamped) {
      return
    }

    const contactInbox = await contactInboxService.findBy({
      where: { id: call.contactInboxId },
    })
    if (contactInbox) {
      await emitCallTranscribed(call.workspaceId, contactInbox.contactId, {
        wacid: data.wacid,
        transcript: transcript.text,
      })
    }
  } catch (err) {
    const error = normalizeError(err)
    logger.error(
      { err: error, wacid: data.wacid },
      "Whatsapp call transcription failed",
    )
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
