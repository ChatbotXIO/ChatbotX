import { aiTimeouts } from "@chatbotx.io/ai"
import { aiIntegrationService, getAIModel } from "@chatbotx.io/ai/server"
import {
  callRecordingService,
  contactInboxService,
  whatsappCallLifecycleService,
} from "@chatbotx.io/business"
import {
  integrationWhatsappRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import type { WhatsappCallModel } from "@chatbotx.io/database/types"
import {
  emitCallTranscribed,
  setWebhookExecutionContext,
} from "@chatbotx.io/events"
import { transcribesCalls } from "@chatbotx.io/utils/whatsapp-call"
import type { CallTranscriptionJobTranscribeCall } from "@chatbotx.io/worker-config"
import { experimental_transcribe as transcribe } from "ai"
import ky from "ky"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import { enrichRecordingMessageWithTranscript } from "./shared/whatsapp-call-recording-enrichment"

const TRANSCRIPTION_MODEL = "whisper-1"

/** External correlation is the wacid/attemptId, never the DB id. */
const externalCorrelationId = (call: {
  wacid: string | null
  attemptId: string | null
  id: string
}): string => call.wacid ?? call.attemptId ?? call.id

/**
 * Silently skips (no retry) when transcribesCalls or the workspace's OpenAI
 * integration is absent — the recording is already saved and usable. Runs
 * on the dedicated callTranscription queue with a limiter
 * (CALL_TRANSCRIBE_PER_MIN/60s), not the shared integration queue, so a call
 * spike can't burn the AI budget.
 */
export const handleWhatsappCallTranscribe = async (
  data: CallTranscriptionJobTranscribeCall["data"],
): Promise<void> => {
  // Required for emitCallTranscribed — see handleWhatsappCallRecordingReady.
  setWebhookExecutionContext({ source: "webhook" })
  logger.info(
    { callId: data.callId },
    "[wa-call-transcript] transcribe job START (browser recording)",
  )
  const call: WhatsappCallModel | undefined =
    await whatsappCallRepository.findById(data.callId)
  // This job is only enqueued after the recording finished uploading, so a
  // present recordingPath is a finished file. recordedAt is deliberately not
  // required — the ready handler stamps it after chaining this job, and
  // requiring it here would race that stamp.
  if (!call?.recordingPath) {
    logger.warn(
      { callId: data.callId },
      "[wa-call-transcript]  skipped: no recording",
    )
    return
  }
  if (call.transcript) {
    return
  }

  const integration =
    await integrationWhatsappRepository.findByInboxIdForWorkspace({
      inboxId: call.inboxId,
      workspaceId: call.workspaceId,
    })
  if (!(integration && transcribesCalls(integration))) {
    logger.info(
      { callId: data.callId },
      "[wa-call-transcript]  skipped: not enabled for this number",
    )
    return
  }

  const aiConfig = await aiIntegrationService.findBy({
    workspaceId: call.workspaceId,
    provider: "openai",
  })
  if (!aiConfig) {
    logger.info(
      { callId: data.callId, workspaceId: call.workspaceId },
      "[wa-call-transcript]  skipped: no OpenAI integration",
    )
    return
  }

  const openaiProvider = getAIModel(aiConfig, "openai")
  if (!("transcription" in openaiProvider)) {
    logger.warn(
      { callId: data.callId },
      "[wa-call-transcript]  skipped: provider lacks transcription",
    )
    return
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)
  try {
    const recordingUrl = await callRecordingService.getRecordingSignedUrl({
      recordingPath: call.recordingPath,
    })
    const audioBuffer = await ky
      .get(recordingUrl, { signal: controller.signal })
      .arrayBuffer()

    const transcript = await transcribe({
      model: openaiProvider.transcription(TRANSCRIPTION_MODEL),
      audio: new Uint8Array(audioBuffer),
      abortSignal: controller.signal,
    })

    if (!transcript.text.trim()) {
      logger.info(
        { callId: data.callId },
        "[wa-call-transcript]  produced empty text; not stamping",
      )
      return
    }

    const stamped = await whatsappCallLifecycleService.attachTranscript({
      id: data.callId,
      transcript: transcript.text,
      transcribedAt: new Date(),
    })
    if (!stamped) {
      return
    }

    await enrichRecordingMessageWithTranscript({ call })
    logger.info(
      { callId: data.callId, transcriptChars: transcript.text.length },
      "[wa-call-transcript] DONE (transcript attached + card enriched)",
    )

    const contactInbox = await contactInboxService.findBy({
      where: { id: call.contactInboxId },
    })
    if (contactInbox) {
      await emitCallTranscribed(call.workspaceId, contactInbox.contactId, {
        callId: externalCorrelationId(call),
        transcript: transcript.text,
      })
    }
  } catch (err) {
    const error = normalizeError(err)
    logger.error(
      { err: error, callId: data.callId },
      "[wa-call-transcript]  failed",
    )
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
