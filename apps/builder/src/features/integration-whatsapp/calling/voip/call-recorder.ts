import {
  ALLOWED_RECORDING_CONTENT_TYPES,
  type RecordingContentType,
} from "@chatbotx.io/sdk"
import { logger } from "@/lib/log"

/**
 * Where the recorded audio is posted — the upload route. Kept as a constant
 * here rather than threaded through every caller since there's exactly one
 * place this module ever uploads to.
 */
const RECORDING_UPLOAD_URL = "/api/whatsapp-call-recording"

/**
 * Candidate mime types keyed off `ALLOWED_RECORDING_CONTENT_TYPES` so the two
 * can't drift. Excludes `audio/ogg`/`audio/mpeg` — server-accepted for Meta's
 * native recordings, but no browser `MediaRecorder` emits them.
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
 * rather than throw — a browser that can't record an allowed format must never
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
   * Flushes the final chunk and uploads; a second call is a no-op. The upload
   * runs async in `onstop` and is never awaited here, so callers must call
   * `stop` before synchronous teardown but don't need to await it.
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
 * Mixes local and remote streams into one `MediaStreamDestination` since
 * `MediaRecorder` only records a single stream. Returns `null` (never throws)
 * if no mime type is supported — recording is best-effort and must never
 * block the call. `stop` is synchronous; the actual upload/cleanup happens
 * async in `onstop`, so a caller's synchronous peer-connection teardown can
 * run right after `stop` without losing the final chunk.
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
