import {
  ALLOWED_RECORDING_CONTENT_TYPES,
  type RecordingContentType,
} from "@chatbotx.io/sdk"
import { logger } from "@/lib/log"

/**
 * Where the recorded audio is posted — the upload route
 * (`apps/builder/src/app/api/whatsapp-call-recording/route.ts`). Kept as a
 * constant here rather than threaded through every caller since there is
 * exactly one place this module ever uploads to.
 */
const RECORDING_UPLOAD_URL = "/api/whatsapp-call-recording"

/**
 * `MediaRecorder`-supported mime types this module will try, most preferred
 * first, each keyed off `ALLOWED_RECORDING_CONTENT_TYPES` (`@chatbotx.io/sdk`)
 * — the canonical allow-list the server actually persists against
 * (`packages/business/src/whatsapp-call/call-recording-service.ts`). The
 * browser-side candidate ordering (codec preference) lives here since it is
 * a browser-only concern, but the base content type itself always comes
 * from the shared map so the two can never drift. Kept as data instead of
 * an if/else chain so a newly-supported codec is a one-line addition. Only
 * mime types a browser `MediaRecorder` can actually produce are listed here
 * (never `audio/ogg` or `audio/mpeg`, which the server also accepts — Meta's
 * native recordings arrive in those — but no browser emits).
 */
type RecordingMimeCandidate = {
  mimeType: string
  baseContentType: RecordingContentType
}

const RECORDING_MIME_CANDIDATES: readonly RecordingMimeCandidate[] = (
  [
    { mimeType: "audio/webm;codecs=opus", baseContentType: "audio/webm" },
    { mimeType: "audio/webm", baseContentType: "audio/webm" },
    {
      mimeType: "audio/mp4;codecs=mp4a.40.2",
      baseContentType: "audio/mp4",
    },
    { mimeType: "audio/mp4", baseContentType: "audio/mp4" },
  ] satisfies RecordingMimeCandidate[]
).filter(
  (candidate) => candidate.baseContentType in ALLOWED_RECORDING_CONTENT_TYPES,
)

type IsTypeSupported = (mimeType: string) => boolean

/**
 * Picks the first candidate `MediaRecorder.isTypeSupported` accepts. Returns
 * `null` when none are supported so the caller can skip recording entirely
 * rather than throw — a browser that can record no allowed format must never
 * block the call itself.
 */
function resolveSupportedRecordingMime(
  isTypeSupported: IsTypeSupported,
): { mimeType: string; baseContentType: string } | null {
  for (const candidate of RECORDING_MIME_CANDIDATES) {
    if (isTypeSupported(candidate.mimeType)) {
      return candidate
    }
  }
  return null
}

export type UploadCallRecording = (params: {
  whatsappCallId: string
  blob: Blob
  contentType: string
}) => Promise<void>

/** Default uploader: POSTs the assembled recording to the upload route. */
const uploadCallRecording: UploadCallRecording = async ({
  whatsappCallId,
  blob,
  contentType,
}) => {
  const formData = new FormData()
  formData.set("audio", blob, `${whatsappCallId}.rec`)
  formData.set("whatsappCallId", whatsappCallId)
  formData.set("contentType", contentType)

  const response = await fetch(RECORDING_UPLOAD_URL, {
    method: "POST",
    body: formData,
  })
  if (!response.ok) {
    throw new Error(`whatsapp-call-recording-upload-failed:${response.status}`)
  }
}

export type CallRecorder = {
  /**
   * Signals the recorder to flush its final chunk and upload. Safe to call
   * more than once — a second call is a no-op. The upload itself runs
   * asynchronously in the `MediaRecorder`'s `onstop` handler and is never
   * awaited by `stop` — callers that tear down the call synchronously
   * (closing the peer connection, stopping mic tracks) must call `stop`
   * BEFORE that teardown so the final chunk is still captured, but they never
   * need to await the upload finishing.
   */
  stop: () => void
}

export type StartCallRecorderParams = {
  whatsappCallId: string
  localStream: MediaStream
  remoteStream: MediaStream
  /** Injectable for tests; defaults to the real POST to the upload route. */
  upload?: UploadCallRecording
  /** Injectable for tests; defaults to `MediaRecorder.isTypeSupported`. */
  isTypeSupported?: IsTypeSupported
}

/**
 * Starts recording a VoIP call by mixing the local (mic) and remote (party)
 * streams into a single `MediaStreamDestination` — `MediaRecorder` only ever
 * records ONE stream, so capturing both sides of the call requires an
 * `AudioContext` mix rather than recording either stream alone.
 *
 * Returns `null` (never throws) when no candidate mime type is supported —
 * recording is best-effort and must never block or fail the call itself.
 *
 * Lifecycle is deliberately decoupled from the call's own (synchronous)
 * teardown: `stop` only requests the final chunk and triggers `onstop`,
 * which assembles the blob, uploads it, and closes the `AudioContext` — all
 * asynchronous and never awaited by `stop` itself, so a caller's
 * synchronous peer-connection/mic cleanup can safely run immediately after
 * calling `stop` without losing the final chunk (`recorder.stop` flushes
 * the last `dataavailable` before firing `onstop`).
 */
export function startCallRecorder(
  params: StartCallRecorderParams,
): CallRecorder | null {
  const {
    whatsappCallId,
    localStream,
    remoteStream,
    upload = uploadCallRecording,
    isTypeSupported = (mimeType: string) =>
      MediaRecorder.isTypeSupported(mimeType),
  } = params

  const resolved = resolveSupportedRecordingMime(isTypeSupported)
  if (!resolved) {
    logger.warn(
      { whatsappCallId },
      "WhatsApp VoIP call recording skipped — no supported MediaRecorder mime type",
    )
    return null
  }
  const { mimeType, baseContentType } = resolved

  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext
  const audioContext = new AudioContextClass()
  const destination = audioContext.createMediaStreamDestination()
  audioContext.createMediaStreamSource(localStream).connect(destination)
  audioContext.createMediaStreamSource(remoteStream).connect(destination)

  const chunks: Blob[] = []
  const mediaRecorder = new MediaRecorder(destination.stream, { mimeType })

  mediaRecorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0) {
      chunks.push(event.data)
    }
  }

  mediaRecorder.onstop = () => {
    const finish = async () => {
      try {
        const blob = new Blob(chunks, { type: baseContentType })
        if (blob.size > 0) {
          await upload({ whatsappCallId, blob, contentType: baseContentType })
        }
      } catch (error) {
        logger.error(
          { err: error, whatsappCallId },
          "WhatsApp VoIP call recording upload failed",
        )
      } finally {
        await audioContext.close().catch(() => undefined)
      }
    }
    finish().catch(() => undefined)
  }

  mediaRecorder.start()

  let stopped = false
  return {
    stop: () => {
      if (stopped) {
        return
      }
      stopped = true
      if (mediaRecorder.state !== "inactive") {
        mediaRecorder.stop()
      }
    },
  }
}
