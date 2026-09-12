import { Queue } from "bullmq"
import { z } from "zod"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import type { FreeswitchApiCommand } from "./commands"

export type { FreeswitchApiCommand } from "./commands"
export {
  freeswitchApiCommandSchema,
  renderFreeswitchApiCommand,
} from "./commands"

/**
 * A FreeSWITCH node id (sharding-by-workspace). Validated wherever a
 * caller turns one into a queue name, so an unvalidated string can never
 * become part of a Redis key.
 */
export const freeswitchNodeIdSchema = z
  .string()
  .regex(/^[a-z0-9-]{1,32}$/, "invalid FreeSWITCH node id")

/**
 * These queue names are deliberately NOT added to `queueNames` (`lib/types.ts`):
 * that enum enumerates the fixed, shared queues every worker replica can
 * subscribe to. FreeSWITCH queues are per-node and dynamic (one pair per
 * `FS_NODES` entry) — consumed only by the ESL-leader process
 * co-located with that node — so a static enum would either need to be kept
 * in sync with infrastructure config or allow arbitrary strings, defeating
 * its purpose. `freeswitchNodeIdSchema` is the validation boundary instead.
 */
export const freeswitchQueueName = (nodeId: string): string =>
  `freeswitch:${freeswitchNodeIdSchema.parse(nodeId)}`

export const freeswitchRecordingsQueueName = (nodeId: string): string =>
  `freeswitch-recordings:${freeswitchNodeIdSchema.parse(nodeId)}`

/**
 * `freeswitchApi` job data — the synchronous ESL API contract: the
 * caller `add()`s with `jobId = requestId` and waits on the result via
 * `waitForJobResult` (strict variant in `lib/job-wait.ts`); the node's
 * ESL-leader worker runs `api <rendered command>` and returns the reply as
 * the job's result.
 */
export type FreeswitchApiJob = {
  type: "freeswitchApi"
  data: {
    requestId: string
    command: FreeswitchApiCommand
  }
}

/**
 * A finished call recording file on a FreeSWITCH node's local disk, ready to
 * be streamed to S3 by that node's co-located `freeswitch` worker.
 * Named generically (`callRecordingUpload`, `channel` discriminator) so a
 * second calling channel can reuse this queue without a WhatsApp-specific
 * type.
 */
export type CallRecordingUploadJob = {
  type: "callRecordingUpload"
  data: {
    channel: "whatsapp"
    nodeId: string
    workspaceId: string
    integrationId: string
    /** FreeSWITCH A-leg uuid — the file's key before any `WhatsappCall` row is guaranteed. */
    rootUuid: string
    /** Local path on the node's `RECORDINGS_DIR` volume. */
    path: string
    vars?: Record<string, string>
  }
}

/** Upload retries while the file stays on disk (5 × exponential from 30 s). */
export const RECORDING_UPLOAD_ATTEMPTS = 5
export const RECORDING_UPLOAD_BACKOFF_MS = 30_000

const freeswitchQueues = new Map<string, Queue<FreeswitchApiJob>>()
const freeswitchRecordingsQueues = new Map<
  string,
  Queue<CallRecordingUploadJob>
>()

/**
 * The node-scoped synchronous ESL API queue. `removeOnComplete: true` is
 * intentional here (unlike the shared queues' count-based retention) —
 * results are always consumed inline by `freeswitchApiClient.run`, never
 * inspected later.
 */
export const getFreeswitchQueue = (nodeId: string): Queue<FreeswitchApiJob> => {
  const name = freeswitchQueueName(nodeId)
  if (isNoRedisEnv()) {
    return fakeQueue as unknown as Queue<FreeswitchApiJob>
  }
  const existing = freeswitchQueues.get(name)
  if (existing) {
    return existing
  }
  const queue = new Queue<FreeswitchApiJob>(name, {
    connection: getRedisConnection(),
    defaultJobOptions: { ...defaultJobOptions, removeOnComplete: true },
  })
  freeswitchQueues.set(name, queue)
  return queue
}

/** The node-scoped recording-upload queue, consumed only by that node's `freeswitch` worker. */
export const getFreeswitchRecordingsQueue = (
  nodeId: string,
): Queue<CallRecordingUploadJob> => {
  const name = freeswitchRecordingsQueueName(nodeId)
  if (isNoRedisEnv()) {
    return fakeQueue as unknown as Queue<CallRecordingUploadJob>
  }
  const existing = freeswitchRecordingsQueues.get(name)
  if (existing) {
    return existing
  }
  const queue = new Queue<CallRecordingUploadJob>(name, {
    connection: getRedisConnection(),
    // Transient failures (DB, S3, "row not ready yet") retry with
    // exponential backoff while the file stays on disk; 5 × 30 s base covers
    // a lifecycle job that is merely late without orphaning the recording.
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: RECORDING_UPLOAD_ATTEMPTS,
      backoff: { type: "exponential", delay: RECORDING_UPLOAD_BACKOFF_MS },
    },
  })
  freeswitchRecordingsQueues.set(name, queue)
  return queue
}
