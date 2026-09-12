/**
 * Recording file sweep: a lost `RECORD_STOP` must never lose a
 * recording. Every `RECORDINGS_DIR/wa/<workspaceId>/<uuid>.ogg` whose uuid is
 * NOT in the live channel set and whose mtime is older than
 * `MIN_AGE_MS` gets the same upload job a `RECORD_STOP` would have enqueued
 * (`jobId rec-upload-<uuid>` — a duplicate is a BullMQ no-op).
 *
 * Injectable I/O for testability — `apps/worker/__tests__/
 * freeswitch-recording-sweep.test.ts` exercises this without a real
 * filesystem/ESL/queue.
 */
export const RECORDING_SWEEP_MIN_AGE_MS = 30_000

export type SweepableRecordingFile = {
  /** Absolute path on the node's `RECORDINGS_DIR` volume. */
  path: string
  /** FreeSWITCH A-leg uuid — parsed from the filename by the caller (`<uuid>.ogg`). */
  uuid: string
  workspaceId: string
  mtimeMs: number
}

export type RecordingSweepDeps = {
  listFiles: () => Promise<SweepableRecordingFile[]>
  isLiveUuid: (uuid: string) => boolean
  now?: () => number
  enqueueUpload: (file: SweepableRecordingFile) => Promise<void>
}

export type RecordingSweepResult = { enqueued: number }

export const sweepRecordingFiles = async (
  deps: RecordingSweepDeps,
): Promise<RecordingSweepResult> => {
  const now = (deps.now ?? Date.now)()
  const files = await deps.listFiles()

  let enqueued = 0
  for (const file of files) {
    if (deps.isLiveUuid(file.uuid)) {
      continue
    }
    if (now - file.mtimeMs < RECORDING_SWEEP_MIN_AGE_MS) {
      continue
    }
    await deps.enqueueUpload(file)
    enqueued++
  }

  return { enqueued }
}

const RECORDING_FILE_PATH_RE = /\/wa\/([^/]+)\/([^/]+)\.ogg$/

/** Parses `<uuid>.ogg` out of a `RECORDINGS_DIR/wa/<workspaceId>/<uuid>.ogg` path. */
export const parseRecordingFilePath = (
  path: string,
): { workspaceId: string; uuid: string } | null => {
  const match = RECORDING_FILE_PATH_RE.exec(path)
  if (!match) {
    return null
  }
  return { workspaceId: match[1], uuid: match[2] }
}
