import { readFile, rename, unlink } from "node:fs/promises"
import { join } from "node:path"
import {
  callRecordingService,
  ensureCallRow,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import {
  integrationWhatsappRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import {
  type CallRecordingUploadJob,
  freeswitchRecordingsQueueName,
  getRedisConnection,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { resolveFreeswitchCallParticipants } from "../integration/handlers/shared/whatsapp-call-participants"
import { logger } from "../lib/logger"

/** `WhatsappCall.id`-keyed, replay-safe (`jobId = rec-ready-<callId>`). */
const recordingReadyJobId = (callId: string): string => `rec-ready-${callId}`

/**
 * A deleted integration means this recording can never be attached to a
 * live number again — move the file aside rather than retrying forever
 *.
 */
const moveToOrphans = async (recordingsDir: string, filePath: string) => {
  const orphanPath = join(
    recordingsDir,
    "orphans",
    filePath.split("/").pop() ?? "",
  )
  await rename(filePath, orphanPath).catch(() => undefined)
}

export type RecordingVolume = {
  /** Where this worker process reads the node's recordings volume. */
  localDir: string
  /** The same volume as FreeSWITCH names it in `Record-File-Path`. */
  freeswitchDir: string
}

const TRAILING_SLASHES_RE = /\/+$/
const LEADING_SLASHES_RE = /^\/+/

/**
 * FreeSWITCH reports recording paths as it sees them (`FS_RECORDINGS_DIR`);
 * the worker may mount the same volume elsewhere (a host directory in local
 * dev). Paths outside the FreeSWITCH prefix are rejected rather than read.
 */
export const toLocalRecordingPath = (
  eventPath: string,
  volume: RecordingVolume,
): string | null => {
  const prefix = volume.freeswitchDir.replace(TRAILING_SLASHES_RE, "")
  if (eventPath !== prefix && !eventPath.startsWith(`${prefix}/`)) {
    return null
  }
  const relative = eventPath
    .slice(prefix.length)
    .replace(LEADING_SLASHES_RE, "")
  if (relative.split("/").includes("..")) {
    return null
  }
  return join(volume.localDir, relative)
}

/**
 * Node-scoped recording-upload consumer — registered only while
 * this replica holds the ESL leader lock for `nodeId` (it is the only
 * process with the local `RECORDINGS_DIR` volume). Idempotent on redelivery:
 * `ensureCallRow` never creates a duplicate row, `attachRecording`'s CAS
 * makes a second successful upload a no-op, and the file is deleted only
 * after the upload itself succeeded.
 */
export const createRecordingConsumer = (
  nodeId: string,
  volume: RecordingVolume,
): Worker<CallRecordingUploadJob["data"]> =>
  new Worker<CallRecordingUploadJob["data"]>(
    freeswitchRecordingsQueueName(nodeId),
    // Workspace-scoped job → blocked-owner guard (AGENTS.md invariant #15):
    // a blocked owner's file is left untouched and the job completes as a
    // no-op instead of retrying or dead-lettering.
    (job: Job<CallRecordingUploadJob["data"]>) =>
      withBlockedOwnerGuard(job.data.workspaceId, () =>
        processRecordingUpload(job.data, volume),
      ),
    {
      connection: getRedisConnection(),
      concurrency: 2,
      // Transient failures (DB, S3, row-not-ready) retry with backoff; the
      // file stays on disk until success.
    },
  )

const processRecordingUpload = async (
  data: CallRecordingUploadJob["data"],
  volume: RecordingVolume,
): Promise<void> => {
  const { workspaceId, integrationId, rootUuid, vars } = data
  const recordingsDir = volume.localDir
  const path = toLocalRecordingPath(data.path, volume)
  if (!path) {
    // Never read outside the recordings volume — a malformed event path is
    // a bug (or a forged event), not something to retry.
    throw new Error(
      `freeswitch-recording-path-rejected: ${data.path} is outside ${volume.freeswitchDir}`,
    )
  }

  // Cross-queue race rule: whichever job for this uuid
  // runs first creates the row, the others attach to it. Check by uuid
  // BEFORE calling `ensureCallRow` — a sweep-originated job carries no
  // enrichment vars, so `ensureCallRow`'s inbound strategy would throw
  // trying to resolve participants for a row that may already exist.
  const call =
    (await whatsappCallRepository.findByFreeswitchUuid(rootUuid)) ??
    (await ensureCallRow({
      rootUuid,
      integrationId,
      vars: vars ?? {},
      // Same resolver the lifecycle handlers use, so an upload-first job
      // creates exactly the row `cbx::call` would have.
      resolveParticipants: (input) =>
        resolveFreeswitchCallParticipants({ workspaceId, ...input }),
    }).catch((error: unknown) => {
      logger.warn(
        { err: error, rootUuid, integrationId },
        "FreeSWITCH recording upload: call row not ready yet",
      )
      return
    }))

  if (!call) {
    // No row yet (sweep-originated job with no enrichment vars, or the
    // lifecycle event has not landed) — retry with backoff (queue
    // `attempts`/`backoff`) rather than orphan the file.
    throw new Error(
      `freeswitch-recording-row-not-ready: no WhatsappCall row for uuid ${rootUuid}`,
    )
  }

  if (integrationId) {
    const integration =
      await integrationWhatsappRepository.findByIdForWorkspace({
        id: integrationId,
        workspaceId,
      })
    if (!integration) {
      await moveToOrphans(recordingsDir, path)
      throw new Error(
        `freeswitch-recording-orphaned: integration ${integrationId} no longer exists`,
      )
    }
  }

  const body = await readFile(path)
  const { recordingPath } = await callRecordingService.uploadRecording({
    callId: call.id,
    workspaceId: call.workspaceId,
    body: new Uint8Array(body),
  })

  // Chain the durable post-processing job BEFORE deleting the local file:
  // the S3 object is keyed by callId either way, but a failed enqueue must
  // leave the file for the next retry rather than orphan the upload.
  await integrationQueue.add(
    IntegrationJobAction.whatsappCallRecordingReady,
    {
      type: IntegrationJobAction.whatsappCallRecordingReady,
      data: {
        callId: call.id,
        workspaceId: call.workspaceId,
        recordingPath,
        correlationId: call.wacid ?? call.attemptId ?? undefined,
      },
    },
    { jobId: recordingReadyJobId(call.id) },
  )

  await unlink(path).catch(() => undefined)
}
