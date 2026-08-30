import { Queue } from "bullmq"
import { z } from "zod"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

/**
 * Workload-class queue: long-lock (10 min), throughput-oriented,
 * latency-tolerant jobs. Coexist historical sync is its first tenant; future
 * heavy actions (e.g. a contact-import backfill) join this queue instead of
 * spawning a new worker. See docs/plans/2026-08-30-heavy-worker-coexist-split.md.
 *
 * Job action strings are unchanged from their former home on
 * `IntegrationJobAction` — this keeps jobId/dedup schemes and the
 * forward-only shim in `apps/worker/src/integration/worker.ts` trivial.
 */
export const HeavyJobAction = {
  coexistWhatsappBuffer: "coexistWhatsappBuffer",
  coexistWhatsappFlush: "coexistWhatsappFlush",
  coexistMessengerSync: "coexistMessengerSync",
  coexistInstagramSync: "coexistInstagramSync",
  coexistAttachmentDownload: "coexistAttachmentDownload",
} as const

/** Buffers a raw WhatsApp Coexistence history payload into the staging table. */
export type HeavyJobCoexistWhatsappBuffer = {
  type: typeof HeavyJobAction.coexistWhatsappBuffer
  data: {
    phoneNumberId: string
    payload: unknown
  }
}

const heavyJobCoexistWhatsappBufferSchema = z.object({
  type: z.literal(HeavyJobAction.coexistWhatsappBuffer),
  data: z.object({
    phoneNumberId: z.string(),
    payload: z.unknown(),
  }),
}) satisfies z.ZodType<HeavyJobCoexistWhatsappBuffer>

/**
 * Flushes buffered WhatsApp staging rows into Contact/Message once enabled.
 * `runId` is optional: the buffer (webhook-driven) omits it and the flush
 * handler looks up the live run by phoneNumberId. Scheduler + self-continuation
 * keep passing the explicit runId so they stay pinned to a specific run.
 */
export type HeavyJobCoexistWhatsappFlush = {
  type: typeof HeavyJobAction.coexistWhatsappFlush
  data: {
    runId?: string
    phoneNumberId: string
  }
}

const heavyJobCoexistWhatsappFlushSchema = z.object({
  type: z.literal(HeavyJobAction.coexistWhatsappFlush),
  data: z.object({
    runId: z.string().optional(),
    phoneNumberId: z.string(),
  }),
}) satisfies z.ZodType<HeavyJobCoexistWhatsappFlush>

/** Pulls historical Messenger conversations/messages via the Graph API. */
export type HeavyJobCoexistMessengerSync = {
  type: typeof HeavyJobAction.coexistMessengerSync
  data: {
    runId: string
    integrationId: string
    workspaceId: string
  }
}

const heavyJobCoexistMessengerSyncSchema = z.object({
  type: z.literal(HeavyJobAction.coexistMessengerSync),
  data: z.object({
    runId: z.string(),
    integrationId: z.string(),
    workspaceId: z.string(),
  }),
}) satisfies z.ZodType<HeavyJobCoexistMessengerSync>

/** Pulls historical native Instagram conversations/messages via the Graph API. */
export type HeavyJobCoexistInstagramSync = {
  type: typeof HeavyJobAction.coexistInstagramSync
  data: {
    runId: string
    integrationId: string
    workspaceId: string
  }
}

const heavyJobCoexistInstagramSyncSchema = z.object({
  type: z.literal(HeavyJobAction.coexistInstagramSync),
  data: z.object({
    runId: z.string(),
    integrationId: z.string(),
    workspaceId: z.string(),
  }),
}) satisfies z.ZodType<HeavyJobCoexistInstagramSync>

/**
 * Downloads a Coexist attachment's bytes from the channel API (Facebook URL
 * for Messenger; WhatsApp media-id for WhatsApp — both encoded into
 * `Attachment.originPath` by the historical importer), uploads to object
 * storage, and UPDATEs the row with the resulting S3 path. Dispatched per
 * attachment after `bulkImportMessages` inserts the placeholder row.
 *
 * Idempotency: jobId `att-${attachmentId}` dedups concurrent enqueues; the
 * handler additionally checks the originPath prefix to no-op on retries
 * where a prior worker already finished the upload.
 */
export type HeavyJobCoexistAttachmentDownload = {
  type: typeof HeavyJobAction.coexistAttachmentDownload
  data: {
    attachmentId: string
    workspaceId: string
    channel: "messenger" | "whatsapp" | "instagram"
    integrationId: string
  }
}

const heavyJobCoexistAttachmentDownloadSchema = z.object({
  type: z.literal(HeavyJobAction.coexistAttachmentDownload),
  data: z.object({
    attachmentId: z.string(),
    workspaceId: z.string(),
    channel: z.enum(["messenger", "whatsapp", "instagram"]),
    integrationId: z.string(),
  }),
}) satisfies z.ZodType<HeavyJobCoexistAttachmentDownload>

export type HeavyJobData =
  | HeavyJobCoexistWhatsappBuffer
  | HeavyJobCoexistWhatsappFlush
  | HeavyJobCoexistMessengerSync
  | HeavyJobCoexistInstagramSync
  | HeavyJobCoexistAttachmentDownload

/**
 * Runtime counterpart of `HeavyJobData`, consumed by the integration worker's
 * forward-only shim (`apps/worker/src/integration/worker.ts`) to *parse* —
 * not cast — an untyped legacy job payload still sitting in `bull:integration`
 * after cutover.
 */
export const heavyJobDataSchema = z.discriminatedUnion("type", [
  heavyJobCoexistWhatsappBufferSchema,
  heavyJobCoexistWhatsappFlushSchema,
  heavyJobCoexistMessengerSyncSchema,
  heavyJobCoexistInstagramSyncSchema,
  heavyJobCoexistAttachmentDownloadSchema,
])

// No per-action JobsOptions today — the default retry (`attempts: 2`) is
// preserved for every coexist action; the scan-runs DB-side attempt tracking
// (`CoexistSyncRun.attempts`) is the real retry authority for sync runs.
export const heavyQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<HeavyJobData>(queueNames.enum.heavy, {
      connection: getRedisConnection(),
      defaultJobOptions,
    })
