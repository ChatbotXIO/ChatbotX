import { whatsappCallRepository } from "@chatbotx.io/database/repositories"
import { uploader } from "@chatbotx.io/filesystem"
import {
  ALLOWED_RECORDING_CONTENT_TYPES,
  type RecordingContentType,
} from "@chatbotx.io/sdk"
import { notFoundException } from "../errors"

const RECORDING_SIGNED_URL_TTL_SECONDS = 15 * 60
const PURGE_BATCH_SIZE_DEFAULT = 500

/**
 * Re-exported for backward compatibility with existing importers —
 * @chatbotx.io/sdk's recording-content-type.ts is the single source of truth;
 * this module never redefines the map.
 */
export type { RecordingContentType } from "@chatbotx.io/sdk"
export { ALLOWED_RECORDING_CONTENT_TYPES } from "@chatbotx.io/sdk"

/** Meta-native recordings are Ogg/Opus; used whenever a caller does not name a type. */
export const DEFAULT_RECORDING_CONTENT_TYPE: RecordingContentType = "audio/ogg"

export const isAllowedRecordingContentType = (
  value: string,
): value is RecordingContentType =>
  Object.hasOwn(ALLOWED_RECORDING_CONTENT_TYPES, value)

/**
 * Thrown by uploadRecording for a mime type outside
 * ALLOWED_RECORDING_CONTENT_TYPES.
 */
export class UnsupportedRecordingContentTypeError extends Error {
  constructor(contentType: string) {
    super(`unsupported-recording-content-type: ${contentType}`)
    this.name = "UnsupportedRecordingContentTypeError"
  }
}

/**
 * Maps an allowed recording mime type to its object-storage extension. Defense-
 * in-depth: callers should validate with isAllowedRecordingContentType first,
 * but this throws rather than silently falling back if an unvalidated value
 * slips through.
 */
export const resolveRecordingExtension = (contentType: string): string => {
  if (!isAllowedRecordingContentType(contentType)) {
    throw new UnsupportedRecordingContentTypeError(contentType)
  }
  return ALLOWED_RECORDING_CONTENT_TYPES[contentType]
}

/** Private object-storage key for a call recording — never a public path. */
const recordingObjectKey = (props: {
  workspaceId: string
  callId: string
  extension: string
}): string =>
  `space/${props.workspaceId}/calls/${props.callId}.${props.extension}`

class CallRecordingService {
  /**
   * Uploads the recording body (browser-recorded blob or Meta-native bytes) to the private
   * object-storage key and returns it; never touches a local filesystem path (must stay
   * Edge-Runtime safe). Callers stamp the path via whatsappCallRepository.attachRecording —
   * this service never writes the DB, keeping retries idempotent at the repository's CAS layer.
   */
  async uploadRecording(props: {
    callId: string
    workspaceId: string
    body: Uint8Array
    contentType?: RecordingContentType
  }): Promise<{ recordingPath: string }> {
    const contentType = props.contentType ?? DEFAULT_RECORDING_CONTENT_TYPE
    const extension = resolveRecordingExtension(contentType)
    const recordingPath = recordingObjectKey({
      workspaceId: props.workspaceId,
      callId: props.callId,
      extension,
    })
    await uploader.putObject(recordingPath, props.body, {
      ContentType: contentType,
    })
    return { recordingPath }
  }

  /** Time-limited signed read for playback — never a public URL. */
  async getRecordingSignedUrl(props: {
    recordingPath: string
  }): Promise<string> {
    return await uploader.getPresignedDownload(
      props.recordingPath,
      RECORDING_SIGNED_URL_TTL_SECONDS,
    )
  }

  /**
   * On-demand playback URL refresh — the initial signed URL expires after
   * RECORDING_SIGNED_URL_TTL_SECONDS (15 min), so a tab left open longer 403s unless it
   * re-requests here. Re-derives the call row from callId (never trusts a client-supplied
   * recordingPath); throws rather than returning null when missing/wrong-workspace/no-recording.
   */
  async getRecordingUrlForCall(props: {
    callId: string
    workspaceId: string
  }): Promise<string> {
    const call = await whatsappCallRepository.findById(props.callId)
    if (
      !call ||
      call.workspaceId !== props.workspaceId ||
      !call.recordingPath
    ) {
      throw notFoundException("Call recording not found")
    }
    return await this.getRecordingSignedUrl({
      recordingPath: call.recordingPath,
    })
  }

  /**
   * Daily retention sweep: deletes recordings past each integration's
   * callRecordingRetentionDays, then nulls the columns — the transcript is
   * kept. One batch per call; the schedule job re-invokes until a pass returns
   * fewer than batchSize.
   */
  async purgeExpiredRecordings(props: { batchSize?: number }): Promise<number> {
    const batchSize = props.batchSize ?? PURGE_BATCH_SIZE_DEFAULT
    const expired = await whatsappCallRepository.listRecordingsPastRetention({
      limit: batchSize,
    })

    let purged = 0
    for (const call of expired) {
      if (!call.recordingPath) {
        continue
      }
      await this.deleteObjectBestEffort(call.recordingPath)
      await whatsappCallRepository.clearRecording({ id: call.id })
      purged++
    }
    return purged
  }

  /**
   * Best-effort object delete: a missing object is not a failure — the DB
   * columns are cleared regardless so a retry never re-attempts an object
   * that's already gone.
   */
  private async deleteObjectBestEffort(key: string): Promise<void> {
    await uploader.deleteObject(key).catch(() => undefined)
  }
}

export const callRecordingService = new CallRecordingService()
