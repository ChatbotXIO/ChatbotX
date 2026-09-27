import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

/**
 * Workload-class queue for jobs that are individually *light* (short, I/O-bound)
 * but arrive in *high volume* and are *low priority* — they must always yield to
 * the latency-sensitive `integration` queue that drives customer replies.
 *
 * Like `heavy`, this queue is intentionally NOT tied to one product domain:
 * enqueue work here whenever running it on a latency-sensitive domain worker
 * would starve customer-facing throughput during a burst. Current tenants are
 * the Coexist/Customer-Scan media backfill jobs (attachment mirroring, contact
 * avatar mirroring); future light-but-bulky jobs can join with their own action.
 */
export const LowJobAction = {
  coexistAttachmentDownload: "coexistAttachmentDownload",
  updateContactAvatar: "updateContactAvatar",
} as const

export type LowJobAction = (typeof LowJobAction)[keyof typeof LowJobAction]

/**
 * Mirror a Coexist historical attachment's bytes to object storage and persist
 * the resulting S3 path on the `Attachment` row. `originPath` carries a pending
 * sentinel (Graph URL or `wa-media:<id>`) until this job resolves it.
 *
 * Idempotency: jobId `att-${attachmentId}` dedups concurrent enqueues; the
 * handler additionally checks the originPath prefix to no-op on retries where a
 * prior worker already finished the upload.
 */
export type LowJobCoexistAttachmentDownload = {
  type: typeof LowJobAction.coexistAttachmentDownload
  data: {
    attachmentId: string
    workspaceId: string
    channel: "messenger" | "whatsapp" | "instagram"
    integrationId: string
  }
}

/**
 * Fetch a contact's profile picture from the channel's Graph/API, mirror the
 * bytes to our object storage, and persist the storage path on the Contact row.
 * Dispatched per-contact after Coexist historical sync / Automatic Customer Scan
 * upsert contacts (which only carry name/sourceId, not avatar).
 */
export type LowJobUpdateContactAvatar = {
  type: typeof LowJobAction.updateContactAvatar
  data: {
    workspaceId: string
    contactInboxId: string
    sourceId: string
  }
}

export type LowJobData =
  | LowJobCoexistAttachmentDownload
  | LowJobUpdateContactAvatar

export const lowQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<LowJobData>(queueNames.enum.low, {
      connection: getRedisConnection(),
      defaultJobOptions,
    })
