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
 * Re-exported for backward compatibility with existing importers of this
 * module — `@chatbotx.io/sdk`'s `recording-content-type.ts` is now the
 * single source of truth (see its docstring); this module never redefines
 * the map.
 */
export type { RecordingContentType } from "@chatbotx.io/sdk"
export { ALLOWED_RECORDING_CONTENT_TYPES } from "@chatbotx.io/sdk"

/** SIP recordings never pass a `contentType` explicitly — this keeps that path unchanged. */
export const DEFAULT_RECORDING_CONTENT_TYPE: RecordingContentType = "audio/ogg"

export const isAllowedRecordingContentType = (
  value: string,
): value is RecordingContentType =>
  Object.hasOwn(ALLOWED_RECORDING_CONTENT_TYPES, value)

/** Thrown by `uploadRecording` for a mime type outside {@link ALLOWED_RECORDING_CONTENT_TYPES}. */
export class UnsupportedRecordingContentTypeError extends Error {
  constructor(contentType: string) {
    super(`unsupported-recording-content-type: ${contentType}`)
    this.name = "UnsupportedRecordingContentTypeError"
  }
}

/**
 * Maps an allowed recording mime type to its object-storage extension.
 * Defense-in-depth: callers (e.g. the browser upload route) are expected to
 * validate with {@link isAllowedRecordingContentType} first, but this throws
 * rather than silently falling back if an unvalidated value slips through.
 */
export const resolveRecordingExtension = (contentType: string): string => {
  if (!isAllowedRecordingContentType(contentType)) {
    throw new UnsupportedRecordingContentTypeError(contentType)
  }
  return ALLOWED_RECORDING_CONTENT_TYPES[contentType]
}

/** Private object-storage key for a call recording (— never a public path). */
const recordingObjectKey = (props: {
  workspaceId: string
  callId: string
  extension: string
}): string =>
  `space/${props.workspaceId}/calls/${props.callId}.${props.extension}`

class CallRecordingService {
  /**
   * Uploads the recording body — a browser-recorded blob posted to the
   * upload route, or Meta-native recording bytes fetched by the worker. This
   * package must stay Edge-Runtime safe, so it never touches a local
   * filesystem path itself. Writes to the private object-storage key and
   * returns that key. Callers
   * stamp it onto the row via `whatsappCallRepository.attachRecording` —
   * this service only handles the transfer, never the DB write, so retries
   * stay idempotent at the repository's CAS layer.
   *
   * `contentType` defaults to `audio/ogg` so the SIP recording-consumer
   * (which never passes it) keeps writing the same `.ogg` key/content-type
   * it always has.
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
   * Workspace-scoped on-demand refresh for playback in the inbox. The
   * signed URL embedded in a `messageCreated`/`messageContentUpdated`
   * realtime broadcast, or one fetched via the initial page load, is only
   * good for {@link RECORDING_SIGNED_URL_TTL_SECONDS} (15 minutes) — a tab
   * left open longer than that gets a 403 on `<audio>` playback unless the
   * caller re-requests a fresh one through here. Re-derives the call row
   * from `callId` so the caller never has to trust a client-supplied
   * `recordingPath`, and throws (never silently returns null) when the call
   * is missing, belongs to a different workspace, or has no recording, so a
   * cross-workspace request is rejected rather than quietly no-op'd.
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
   * Daily retention sweep: deletes recordings past each
   * integration's `callRecordingRetentionDays`, then nulls the columns —
   * the transcript is kept. One batch per call; the caller (schedule job)
   * re-invokes until a pass returns fewer than `batchSize`.
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
   * that is already gone.
   */
  private async deleteObjectBestEffort(key: string): Promise<void> {
    await uploader.deleteObject(key).catch(() => undefined)
  }
}

export const callRecordingService = new CallRecordingService()
