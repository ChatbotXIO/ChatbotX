import { aiTimeouts } from "@chatbotx.io/ai"
import { aiIntegrationService, getAIModel } from "@chatbotx.io/ai/server"
import {
  callRecordingService,
  contactInboxService,
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
import type { CallTranscriptionJobTranscribeCall } from "@chatbotx.io/worker-config"
import { experimental_transcribe as transcribe } from "ai"
import ky from "ky"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"

const TRANSCRIPTION_MODEL = "whisper-1"

/** External correlation is the wacid/attemptId, never the DB id. */
const externalCorrelationId = (call: {
  wacid: string | null
  attemptId: string | null
  id: string
}): string => call.wacid ?? call.attemptId ?? call.id

/**
 * Speech-to-text over a stored call recording. Opt-in per integration
 * (`callTranscriptionEnabled`, default false) and requires the
 * workspace's OpenAI integration; silently skips (no retry) when either is
 * absent — the recording itself is already saved and usable.
 *
 * Runs on the dedicated `callTranscription` queue, consumed by
 * a second `Worker` inside `apps/worker/src/integration/worker.ts` with a
 * `limiter: { max: env.CALL_TRANSCRIBE_PER_MIN, duration: 60_000 }` so a
 * call spike cannot burn the AI budget — never the shared `integration`
 * queue.
 */
export const handleWhatsappCallTranscribe = async (
  data: CallTranscriptionJobTranscribeCall["data"],
): Promise<void> => {
  // See handleWhatsappCallRecordingReady — required for emitCallTranscribed.
  setWebhookExecutionContext({ source: "webhook" })
  const call: WhatsappCallModel | undefined =
    await whatsappCallRepository.findById(data.callId)
  // This job is only enqueued after the recording finished uploading, so a
  // present recordingPath is a finished file. recordedAt is deliberately
  // NOT required — the ready handler stamps it after chaining this job, and
  // requiring it here would race that stamp.
  if (!call?.recordingPath) {
    logger.warn(
      { callId: data.callId },
      "Whatsapp call transcription skipped: no recording",
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
  if (!integration?.callTranscriptionEnabled) {
    logger.info(
      { callId: data.callId },
      "Whatsapp call transcription skipped: not enabled for this number",
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
      "Whatsapp call transcription skipped: no OpenAI integration",
    )
    return
  }

  const openaiProvider = getAIModel(aiConfig, "openai")
  if (!("transcription" in openaiProvider)) {
    logger.warn(
      { callId: data.callId },
      "Whatsapp call transcription skipped: provider lacks transcription",
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
        "Whatsapp call transcription produced empty text; not stamping",
      )
      return
    }

    const stamped = await whatsappCallRepository.attachTranscript({
      id: data.callId,
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
        callId: externalCorrelationId(call),
        transcript: transcript.text,
      })
    }
  } catch (err) {
    const error = normalizeError(err)
    logger.error(
      { err: error, callId: data.callId },
      "Whatsapp call transcription failed",
    )
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
