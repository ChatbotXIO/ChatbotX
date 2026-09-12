import { whatsappCallRepository } from "@chatbotx.io/database/repositories"
import { uploader } from "@chatbotx.io/filesystem"

const RECORDING_SIGNED_URL_TTL_SECONDS = 15 * 60
const PURGE_BATCH_SIZE_DEFAULT = 500

/** Private object-storage key for a call recording (— never a public path). */
const recordingObjectKey = (props: {
  workspaceId: string
  callId: string
}): string => `space/${props.workspaceId}/calls/${props.callId}.ogg`

class CallRecordingService {
  /**
   * Uploads the `.ogg` file body (written by FreeSWITCH `record_session` on
   * the node, opened and streamed by the caller — this package must stay
   * Edge-Runtime safe, so it never touches a local filesystem path itself)
   * to the private object-storage key and returns that key. Callers stamp
   * it onto the row via `whatsappCallRepository.attachRecording` — this
   * service only handles the transfer, never the DB write, so retries stay
   * idempotent at the repository's CAS layer.
   */
  async uploadRecording(props: {
    callId: string
    workspaceId: string
    body: Uint8Array
  }): Promise<{ recordingPath: string }> {
    const recordingPath = recordingObjectKey(props)
    await uploader.putObject(recordingPath, props.body, {
      ContentType: "audio/ogg",
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
