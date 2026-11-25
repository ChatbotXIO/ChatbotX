import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getQueueConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"
import type {
  IntegrationJobReceiveComment,
  LowRoutedIntegrationJob,
} from "../integration"

/**
 * Workload-class queue for jobs that are individually *light* (short, I/O-bound)
 * but arrive in *high volume* and are *low priority* — they must always yield to
 * the latency-sensitive `integration` queue that drives customer replies.
 *
 * Like `heavy`, this queue is intentionally NOT tied to one product domain:
 * enqueue work here whenever running it on a latency-sensitive domain worker
 * would starve customer-facing throughput during a burst. Current tenants are
 * the Coexist/Customer-Scan media backfill jobs (attachment mirroring, contact
 * avatar mirroring), and the bookkeeping ingress that `enqueueIntegrationJob`
 * routes here (read receipts, delivery statuses, channel echoes); future
 * light-but-bulky jobs can join with their own action.
 */
export const LowJobAction = {
  coexistAttachmentDownload: "coexistAttachmentDownload",
  updateContactAvatar: "updateContactAvatar",
  replayMissedComment: "replayMissedComment",
  syncChannelPosts: "syncChannelPosts",
  refreshChannelPost: "refreshChannelPost",
  reconnectPublishFanOut: "reconnectPublishFanOut",
  refreshPublishDestinationAvatar: "refreshPublishDestinationAvatar",
  // Routed here by `enqueueIntegrationJob`; same strings as IntegrationJobAction.
  messageStatus: "messageStatus",
  contactMarkAsRead: "contactMarkAsRead",
  incomingMessageEcho: "incomingMessageEcho",
  liveVideoStatusChange: "liveVideoStatusChange",
} as const

export type LowJobAction = (typeof LowJobAction)[keyof typeof LowJobAction]

/**
 * BullMQ priority for bulk producers on this queue (attachment mirroring,
 * avatar mirroring, missed-comment replay). Jobs without a priority run first,
 * so the unprioritized receipts/echoes always pass a backlog of these.
 */
export const LOW_BULK_PRIORITY = 10

/**
 * Mirror a Coexist historical attachment's bytes to object storage and persist
 * the resulting S3 path on the `Attachment` row. `originPath` carries a pending
 * sentinel (Graph URL or `wa-media:<id>`) until this job resolves it.
 *
 * Idempotency: jobId `att-${attachmentId}` dedups concurrent enqueues; the
 * handler additionally checks the originPath prefix to no-op on retries where a
 * prior worker already finished the upload.
 *
 * `restore` re-uploads an already mirrored attachment into its existing storage
 * key instead (its object was evicted); that path never writes the row.
 */
export type LowJobCoexistAttachmentDownload = {
  type: typeof LowJobAction.coexistAttachmentDownload
  data: {
    attachmentId: string
    workspaceId: string
    channel: "messenger" | "whatsapp" | "instagram"
    integrationId: string
    restore?: boolean
    // Parent message createdAt (epoch ms): routes the sharded lookup.
    messageCreatedAt?: number
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

/**
 * One comment of a "process missed comments" run: ingested exactly like its
 * channel's webhook, then run through the one automation in `replay`. A run can
 * hold thousands of these, which is why they live here and never on the
 * `integration` queue that answers live customers. `workspaceId` is the
 * automation's, carried so the worker can apply `withBlockedOwnerGuard`.
 */
export type LowJobReplayMissedComment = {
  type: typeof LowJobAction.replayMissedComment
  data: IntegrationJobReceiveComment["data"] & {
    workspaceId: string
    replay: { automationId: string }
  }
}

/**
 * One slice of a channel's post sync: reads up to a few pages of the inbox's
 * posts and hands the rest to the next scanner tick.
 */
export type LowJobSyncChannelPosts = {
  type: typeof LowJobAction.syncChannelPosts
  data: { inboxId: string; workspaceId: string }
}

/** Re-reads one post from its channel: its counts, or that it is gone. */
export type LowJobRefreshChannelPost = {
  type: typeof LowJobAction.refreshChannelPost
  data: {
    channelPostId: string
    /** Set when the refresh follows a publish from Posts: the composed post is told once the counts are read. */
    publishedTarget?: { socialPostId: string; targetId: string }
    workspaceId: string
  }
}

/**
 * The rest of a Facebook-login reconnect fan-out that did not fit the inline
 * budget (100 pages / 20 s): refresh the other inbox integrations of the same
 * person in the same workspace. Idempotent (a refreshed row is simply matched
 * again) and guarded exactly like the inline run: same workspace, same app
 * client id, same stored authorizer, connected inbox only, never creates one.
 *
 * `encryptedPages` is the JSON of an `EncryptedData` blob (AAD bound to the
 * workspace and the Facebook user) holding the page ids and page tokens; no
 * token ever sits in Redis in plaintext. jobId `reconnect-fan-out-<workspace>-<facebookUserId>-h<hop>`
 * dedups a second reconnect while one is queued or running; a job that runs out
 * of budget enqueues the next hop (never its own id), up to a bounded hop count.
 */
export type LowJobReconnectPublishFanOut = {
  type: typeof LowJobAction.reconnectPublishFanOut
  data: {
    workspaceId: string
    /**
     * ISO time the reconnect began (its authorization generation): rows written
     * after it are never overwritten with this job's older snapshot, and rows
     * this job writes are stamped with it.
     */
    authorizedAt: string
    clientId: string
    facebookUserId: string
    encryptedPages: string
    /** Permissions the reconnect saw (same user, same app); null when unknown. */
    grantedScopes: string[] | null
    kinds: ("messenger" | "instagramFacebook")[]
    /** The row the reconnect already refreshed; the job never touches it. */
    selectedIntegrationId?: string
    /** Continuation count: 0 for the first job, +1 per continuation, capped by the service. */
    hop: number
  }
}

/**
 * Fetches and re-hosts the page or profile picture of one inbox publish
 * destination (Facebook Page, Instagram, Threads). Carries ids only: the worker
 * loads the token itself, so no credential sits in Redis. jobId
 * `refresh-publish-destination-avatar-<destinationId>` dedups a connect, a
 * reconnect and the list backfill that all ask for the same destination.
 */
export type LowJobRefreshPublishDestinationAvatar = {
  type: typeof LowJobAction.refreshPublishDestinationAvatar
  data: { workspaceId: string; publishDestinationId: string }
}

export type LowJobData =
  | LowJobReconnectPublishFanOut
  | LowJobRefreshPublishDestinationAvatar
  | LowJobCoexistAttachmentDownload
  | LowJobSyncChannelPosts
  | LowJobRefreshChannelPost
  | LowJobUpdateContactAvatar
  | LowJobReplayMissedComment
  | LowRoutedIntegrationJob

export const lowQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<LowJobData>(queueNames.enum.low, {
      connection: getQueueConnection(queueNames.enum.low),
      defaultJobOptions,
    })
