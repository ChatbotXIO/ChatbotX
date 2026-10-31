import {
  aiIntegrationService,
  getAIModel,
  inspectMuseWav,
  MuseTranscribeError,
  MuseWavFormatError,
  transcribeWithMuse,
} from "@chatbotx.io/ai/server"
import type { AISpeechToTextSchema } from "@chatbotx.io/flow-config"
import { transcribe } from "ai"
import { z } from "zod"
import { env } from "../../env"
import type { HeavyStepComputeProps } from "../../integration/handlers/flow-utils"
import { readCustomFieldValue } from "../../integration/utils/contact"
import { logger } from "../../lib/logger"
import { getSpeechToTextAttemptTimeoutMs } from "../timeouts"
import { downloadWithByteLimit } from "./bounded-download"
import { ExpectedHeavyStepError } from "./errors"

const supportedAudioMimeTypes = z.enum([
  "audio/flac",
  "audio/mpeg",
  "audio/mpga",
  "audio/m4a",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "audio/x-wav",
  "audio/mp3",
])

type AIIntegration = NonNullable<
  Awaited<ReturnType<typeof aiIntegrationService.findBy>>
>

type ProviderTranscribeProps<T extends AISpeechToTextSchema> = Pick<
  HeavyStepComputeProps<T>,
  "conversation" | "step"
> & {
  aiConfig: AIIntegration
  audioUrl: string
  sessionId: string
  signal: AbortSignal
  timeoutMs: number
}

export type SpeechToTextComputeProps =
  HeavyStepComputeProps<AISpeechToTextSchema> & {
    /** Heavy job id: stable across BullMQ retries of the same step run. */
    sessionId: string
  }

async function transcribeOpenAI({
  aiConfig,
  audioUrl,
  signal,
  step,
}: ProviderTranscribeProps<
  Extract<AISpeechToTextSchema, { provider: "openai" }>
>): Promise<string> {
  const openaiProvider = getAIModel(aiConfig, "openai")
  if (!("transcription" in openaiProvider)) {
    throw new ExpectedHeavyStepError(
      `Provider ${step.provider} does not support transcription`,
    )
  }

  const audio = await downloadWithByteLimit({
    allowedMimeTypes: new Set(supportedAudioMimeTypes.options),
    label: "audio",
    maxBytes: env.HEAVY_MAX_AUDIO_BYTES,
    signal,
    url: audioUrl,
  })

  const transcript = await transcribe({
    model: openaiProvider.transcription(step.model),
    audio: new Uint8Array(audio.buffer),
    abortSignal: signal,
  })

  return transcript.text
}

const MUSE_FORMAT_HINT =
  "Muse Voice Transcribe requires WAV PCM 16-bit mono 16/24 kHz ≤ 10 min"

async function transcribeMuse({
  aiConfig,
  audioUrl,
  conversation,
  sessionId,
  signal,
  step,
  timeoutMs,
}: ProviderTranscribeProps<
  Extract<AISpeechToTextSchema, { provider: "muse" }>
>): Promise<string> {
  // Check the bytes, not `content-type`: storage often serves WAV as
  // `binary/octet-stream`/`application/octet-stream` or with no header at all.
  // `inspectMuseWav` below is what decides.
  const { buffer } = await downloadWithByteLimit({
    label: "audio",
    maxBytes: env.MUSE_TRANSCRIBE_MAX_AUDIO_BYTES,
    signal,
    url: audioUrl,
  })
  const backing = buffer.buffer
  if (!(backing instanceof ArrayBuffer)) {
    throw new Error("Downloaded audio is not backed by an ArrayBuffer")
  }
  // A pooled Buffer can share a larger backing store; only its own bytes are
  // inspected and uploaded.
  const audio = new Uint8Array(backing, buffer.byteOffset, buffer.byteLength)

  try {
    inspectMuseWav(audio)
  } catch (error) {
    if (error instanceof MuseWavFormatError) {
      logger.info(
        {
          conversationId: conversation.id,
          provider: "muse",
          reason: error.reason,
          sessionId,
          workspaceId: conversation.workspaceId,
        },
        "Muse speech-to-text rejected the audio format",
      )
      throw new ExpectedHeavyStepError(
        `${MUSE_FORMAT_HINT}: ${error.message}`,
        { cause: error },
      )
    }
    throw error
  }

  let result: Awaited<ReturnType<typeof transcribeWithMuse>>
  try {
    result = await transcribeWithMuse({
      audio,
      integration: aiConfig,
      keywords: step.keywords,
      languageBias: step.languageBias,
      model: step.model,
      sessionId,
      signal,
      timeoutMs,
    })
  } catch (error) {
    // Retryable failures keep their `retryable`/`status` for
    // `isRetryableHeavyError`; permanent ones go to the error state.
    if (error instanceof MuseTranscribeError && !error.retryable) {
      throw new ExpectedHeavyStepError(error.message, { cause: error })
    }
    throw error
  }

  const text = result.text.trim()
  if (!text) {
    throw new ExpectedHeavyStepError("Muse returned an empty transcript")
  }

  logger.info(
    {
      audioDurationMs: result.audioDurationMs,
      conversationId: conversation.id,
      museSessionId: result.sessionId,
      provider: "muse",
      sessionId,
      transcriptChars: text.length,
      workspaceId: conversation.workspaceId,
    },
    "Muse speech-to-text completed",
  )
  return text
}

export async function speechToTextOutput({
  conversation,
  sessionId,
  step,
}: SpeechToTextComputeProps): Promise<string> {
  const timeoutMs = getSpeechToTextAttemptTimeoutMs(step.provider)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const aiConfig = await aiIntegrationService.findBy({
      workspaceId: conversation.workspaceId,
      provider: step.provider,
    })

    if (!aiConfig) {
      throw new ExpectedHeavyStepError("AI integration not found")
    }

    const audioUrl = await readCustomFieldValue({
      customFieldId: step.inputFieldId,
      contactId: conversation.contactId,
    })

    if (!audioUrl) {
      throw new ExpectedHeavyStepError("No audio URL provided")
    }

    const shared = {
      aiConfig,
      audioUrl,
      conversation,
      sessionId,
      signal: controller.signal,
      timeoutMs,
    }
    switch (step.provider) {
      case "openai":
        return await transcribeOpenAI({ ...shared, step })
      case "muse":
        return await transcribeMuse({ ...shared, step })
      default: {
        const exhaustive: never = step
        throw new Error(`Unsupported speech-to-text step: ${exhaustive}`)
      }
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
