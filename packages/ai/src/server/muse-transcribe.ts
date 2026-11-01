/**
 * Muse Voice Transcribe over the Meta Model API (`POST /v1/asr/transcribe`).
 *
 * Muse only accepts WAV (RIFF, PCM 16-bit, mono, 16/24 kHz, at most 10 min,
 * request at most 32 MB). Nothing here converts audio: `inspectMuseWav`
 * checks the header and the caller routes anything else to the step's error
 * state. Plain `DataView`/`FormData`/`Blob` only — no `node:*` or `Buffer` —
 * so the module is safe in the builder's Edge instrumentation graph
 * (AGENTS.md invariant 25).
 */
import type { MuseVoiceLanguage } from "@chatbotx.io/flow-config"
import { secretTextAuthSchema } from "@chatbotx.io/sdk"
import ky, { HTTPError } from "ky"
import { z } from "zod"
import { MUSE_BASE_URL } from "../core/muse"
import type { MuseTranscriptionModel } from "../models/muse"

export const MUSE_TRANSCRIBE_URL = `${MUSE_BASE_URL}/asr/transcribe`
export const MUSE_TRANSCRIBE_MAX_SECONDS = 600
export const MUSE_TRANSCRIBE_MAX_REQUEST_BYTES = 32 * 1024 * 1024
// Conservative room for the multipart boundaries, headers and request JSON.
export const MUSE_TRANSCRIBE_MULTIPART_OVERHEAD_BYTES = 64 * 1024
export const MUSE_WAV_SAMPLE_RATES = [16_000, 24_000] as const

const WAV_MAX_CHUNKS = 64
const WAV_PCM_FORMAT = 1
const WAV_BYTES_PER_SAMPLE = 2
// Streaming writers leave the size unknown; only then is "rest of file" used.
const WAV_UNKNOWN_SIZE = 0xff_ff_ff_ff

export type MuseWavFormatReason =
  | "notWav"
  | "notPcm"
  | "notMono"
  | "not16Bit"
  | "unsupportedSampleRate"
  | "tooLong"
  | "noAudioData"
  | "malformed"

export class MuseWavFormatError extends Error {
  readonly reason: MuseWavFormatReason

  constructor(
    reason: MuseWavFormatReason,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = "MuseWavFormatError"
    this.reason = reason
  }
}

export type MuseWavInfo = {
  sampleRate: (typeof MUSE_WAV_SAMPLE_RATES)[number]
  dataBytes: number
  durationSeconds: number
}

type WavFmt = {
  audioFormat: number
  bitsPerSample: number
  channels: number
  sampleRate: number
}

function readTag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  )
}

function isMuseSampleRate(rate: number): rate is MuseWavInfo["sampleRate"] {
  return MUSE_WAV_SAMPLE_RATES.some((supported) => supported === rate)
}

/** Reads only the RIFF header and chunk table; O(chunks), at most 64. */
export function inspectMuseWav(bytes: Uint8Array): MuseWavInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const length = bytes.byteLength

  const startsWithRiff = length >= 4 && readTag(view, 0) === "RIFF"
  if (!startsWithRiff) {
    throw new MuseWavFormatError("notWav", "File is not a RIFF/WAV file")
  }
  if (length < 12) {
    throw new MuseWavFormatError("malformed", "WAV header is truncated")
  }
  if (readTag(view, 8) !== "WAVE") {
    throw new MuseWavFormatError("notWav", "RIFF file is not WAVE audio")
  }

  const riffSize = view.getUint32(4, true)
  const streamingRiff = riffSize === WAV_UNKNOWN_SIZE || riffSize === 0
  const containerEnd = streamingRiff ? length : 8 + riffSize
  if (containerEnd > length) {
    throw new MuseWavFormatError(
      "malformed",
      `WAV declares ${containerEnd} bytes but the file has ${length}`,
    )
  }

  let fmt: WavFmt | undefined
  let dataBytes: number | undefined
  let offset = 12
  let chunks = 0

  while (offset + 8 <= containerEnd && !(fmt && dataBytes !== undefined)) {
    chunks += 1
    if (chunks > WAV_MAX_CHUNKS) {
      throw new MuseWavFormatError(
        "malformed",
        `WAV has more than ${WAV_MAX_CHUNKS} chunks`,
      )
    }

    const id = readTag(view, offset)
    const size = view.getUint32(offset + 4, true)
    const bodyStart = offset + 8

    if (id === "data" && size === WAV_UNKNOWN_SIZE) {
      dataBytes = containerEnd - bodyStart
      break
    }

    const paddedEnd = bodyStart + size + (size % 2)
    if (paddedEnd > containerEnd) {
      throw new MuseWavFormatError(
        "malformed",
        `WAV chunk "${id}" declares ${size} bytes past the end of the file`,
      )
    }

    if (id === "fmt ") {
      if (size < 16) {
        throw new MuseWavFormatError("malformed", "WAV fmt chunk is too short")
      }
      fmt = {
        audioFormat: view.getUint16(bodyStart, true),
        channels: view.getUint16(bodyStart + 2, true),
        sampleRate: view.getUint32(bodyStart + 4, true),
        bitsPerSample: view.getUint16(bodyStart + 14, true),
      }
    } else if (id === "data") {
      dataBytes = size
    }

    offset = paddedEnd
  }

  if (!fmt) {
    throw new MuseWavFormatError("malformed", "WAV has no fmt chunk")
  }
  if (fmt.audioFormat !== WAV_PCM_FORMAT) {
    throw new MuseWavFormatError(
      "notPcm",
      `WAV audio format is ${fmt.audioFormat}; Muse requires PCM (1)`,
    )
  }
  if (fmt.channels !== 1) {
    throw new MuseWavFormatError(
      "notMono",
      `WAV has ${fmt.channels} channels; Muse requires mono`,
    )
  }
  if (fmt.bitsPerSample !== 16) {
    throw new MuseWavFormatError(
      "not16Bit",
      `WAV is ${fmt.bitsPerSample}-bit; Muse requires 16-bit`,
    )
  }
  const { sampleRate } = fmt
  if (!isMuseSampleRate(sampleRate)) {
    throw new MuseWavFormatError(
      "unsupportedSampleRate",
      `WAV sample rate is ${sampleRate} Hz; Muse requires 16000 or 24000 Hz`,
    )
  }
  if (!dataBytes) {
    throw new MuseWavFormatError("noAudioData", "WAV has no audio data")
  }

  const durationSeconds = dataBytes / (sampleRate * WAV_BYTES_PER_SAMPLE)
  if (durationSeconds > MUSE_TRANSCRIBE_MAX_SECONDS) {
    throw new MuseWavFormatError(
      "tooLong",
      `WAV is ${Math.ceil(durationSeconds)} s long; Muse allows at most ${MUSE_TRANSCRIBE_MAX_SECONDS} s`,
    )
  }

  return { sampleRate, dataBytes, durationSeconds }
}

export type MuseTranscribeErrorCode =
  | "invalid_auth"
  | "request_too_large"
  | "http_error"
  | "invalid_response"
  | "network_error"

/**
 * `retryable` and `status` are read by the heavy worker's retry policy
 * (`isRetryableHeavyError`): only Meta 408/429/5xx and transport failures are
 * worth a second paid attempt. A malformed response is not — that attempt was
 * already billed and a retry would get the same shape back.
 */
export class MuseTranscribeError extends Error {
  readonly code: MuseTranscribeErrorCode
  readonly retryable: boolean
  readonly sessionId: string
  readonly status?: number

  constructor(
    message: string,
    options: {
      cause?: unknown
      code: MuseTranscribeErrorCode
      retryable: boolean
      sessionId: string
      status?: number
    },
  ) {
    super(message, { cause: options.cause })
    this.name = "MuseTranscribeError"
    this.code = options.code
    this.retryable = options.retryable
    this.sessionId = options.sessionId
    this.status = options.status
  }
}

const nonNegativeMs = z.number().finite().nonnegative()

// Loose objects: a new Meta field must not fail a paid transcription. Only
// `transcript` is required; the other fields are informational, so a shape
// change there must not discard a transcript that was already paid for.
const museTranscribeResponseSchema = z.looseObject({
  sessionId: z.string().optional(),
  transcript: z.string(),
  audioDurationMs: nonNegativeMs.optional().catch(undefined),
  turns: z
    .array(
      z.looseObject({
        turnId: z.union([z.number().int().nonnegative(), z.string()]),
        startMs: nonNegativeMs,
        endMs: nonNegativeMs,
        transcript: z.string(),
        speaker: z.union([z.string(), z.number()]).optional(),
      }),
    )
    .optional()
    .catch(undefined),
})

const museErrorDetailSchema = z.looseObject({
  message: z.string().optional(),
  type: z.string().optional(),
  code: z.union([z.string(), z.number()]).optional(),
  param: z.string().nullish(),
})
const museWrappedErrorBodySchema = z.looseObject({
  error: museErrorDetailSchema,
})

function describeMuseErrorBody(data: unknown): string | undefined {
  const wrapped = museWrappedErrorBodySchema.safeParse(data)
  const parsed = wrapped.success
    ? { success: true as const, data: wrapped.data.error }
    : museErrorDetailSchema.safeParse(data)
  if (!parsed.success) {
    return typeof data === "string" && data.trim()
      ? data.trim().slice(0, 300)
      : undefined
  }
  const detail = parsed.data
  const parts = [
    detail.message,
    detail.type && `type=${detail.type}`,
    detail.code !== undefined && `code=${detail.code}`,
    detail.param && `param=${detail.param}`,
  ].filter((part): part is string => typeof part === "string" && part !== "")
  return parts.length > 0 ? parts.join(", ").slice(0, 300) : undefined
}

const PERMANENT_STATUSES = new Set([400, 401, 403, 406, 413])

function isRetryableStatus(status: number): boolean {
  if (PERMANENT_STATUSES.has(status)) {
    return false
  }
  return status === 408 || status === 429 || status >= 500
}

export type TranscribeWithMuseInput = {
  /** Resolved `IntegrationMuse` row; only `auth` is read. */
  integration: { auth: unknown }
  /** Exactly the WAV bytes to upload, already checked by `inspectMuseWav`. */
  audio: Uint8Array<ArrayBuffer>
  model: MuseTranscriptionModel
  languageBias?: readonly MuseVoiceLanguage[]
  keywords?: readonly string[]
  /** Correlation id; keep it stable across retries of the same job. */
  sessionId: string
  signal: AbortSignal
  timeoutMs: number
  /** Test seam; defaults to the global fetch through ky. */
  fetch?: typeof fetch
}

export type TranscribeWithMuseResult = {
  text: string
  sessionId: string
  audioDurationMs?: number
}

export async function transcribeWithMuse(
  input: TranscribeWithMuseInput,
): Promise<TranscribeWithMuseResult> {
  const { sessionId } = input
  const auth = secretTextAuthSchema.safeParse(input.integration.auth)
  if (!auth.success) {
    throw new MuseTranscribeError("Muse integration credentials are invalid", {
      cause: auth.error,
      code: "invalid_auth",
      retryable: false,
      sessionId,
    })
  }

  const requestBytes =
    input.audio.byteLength + MUSE_TRANSCRIBE_MULTIPART_OVERHEAD_BYTES
  if (requestBytes > MUSE_TRANSCRIBE_MAX_REQUEST_BYTES) {
    throw new MuseTranscribeError(
      `Audio is ${input.audio.byteLength} bytes; Muse requests must stay under ${MUSE_TRANSCRIBE_MAX_REQUEST_BYTES} bytes`,
      { code: "request_too_large", retryable: false, sessionId },
    )
  }

  const request = {
    model: input.model,
    audioEncoding: "WAV",
    mode: "PUSH_TO_TALK",
    ...(input.languageBias?.length ? { languageBias: input.languageBias } : {}),
    ...(input.keywords?.length ? { keywords: input.keywords } : {}),
  }
  const body = new FormData()
  body.append(
    "request",
    new Blob([JSON.stringify(request)], { type: "application/json" }),
  )
  body.append(
    "audio",
    new Blob([input.audio], { type: "audio/wav" }),
    "audio.wav",
  )

  let json: unknown
  try {
    json = await ky
      .post(MUSE_TRANSCRIBE_URL, {
        body,
        fetch: input.fetch,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${auth.data.secretText}`,
        },
        // BullMQ owns retries, so a failed attempt is never paid for twice.
        retry: 0,
        searchParams: { sessionId },
        signal: input.signal,
        timeout: input.timeoutMs,
      })
      .json()
  } catch (error) {
    if (error instanceof HTTPError) {
      const status = error.response.status
      const detail = describeMuseErrorBody(error.data)
      throw new MuseTranscribeError(
        `Muse transcription failed with status ${status}${detail ? `: ${detail}` : ""}`,
        {
          cause: error,
          code: "http_error",
          retryable: isRetryableStatus(status),
          sessionId,
          status,
        },
      )
    }
    throw new MuseTranscribeError("Muse transcription request failed", {
      cause: error,
      code: "network_error",
      retryable: true,
      sessionId,
    })
  }

  const parsed = museTranscribeResponseSchema.safeParse(json)
  if (!parsed.success) {
    throw new MuseTranscribeError("Muse transcription response is invalid", {
      cause: parsed.error,
      code: "invalid_response",
      retryable: false,
      sessionId,
    })
  }

  return {
    text: parsed.data.transcript,
    sessionId: parsed.data.sessionId ?? sessionId,
    audioDurationMs: parsed.data.audioDurationMs,
  }
}
