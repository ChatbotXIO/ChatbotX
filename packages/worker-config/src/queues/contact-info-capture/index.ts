import type { ContactInfoSourceType } from "@chatbotx.io/database/partials"
import type { ContactInfoCaptureInfoType } from "@chatbotx.io/flow-config"
import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getQueueConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

const ContactInfoCaptureJobAction = {
  capture: "capture",
} as const

/** Where the next run of a capture search resumes: a window plus the last message seen. */
export type ContactInfoCaptureSearchCursor = {
  /** The message tuple the next page reads strictly before; `createdAt` is microsecond-exact timestamptz text. */
  before: { createdAt: string; id: string }
  followedFlowId?: string
  /** Job runs already used. */
  run: number
  /** Index into the look-back windows; one past the last is "from the conversation start". */
  windowIndex: number
}

/** What the search decided, kept while the job waits for the recipient to be marked delivered. */
export type ContactInfoCaptureJobSource = {
  followedFlowId?: string
  sourceId: string
  sourceType: ContactInfoSourceType
}

export type ContactInfoCaptureJobData = {
  type: typeof ContactInfoCaptureJobAction.capture
  data: {
    workspaceId: string
    contactId: string
    contactInboxId: string
    inboxId: string
    conversationId: string
    /**
     * When the conversation was created (ISO): the search never looks before it.
     * Absent on jobs queued before this field existed; the service then reads
     * the conversation itself.
     */
    conversationCreatedAt?: string
    /** The inbound message that carried the phone/email, and its exact stored `createdAt` (ISO). */
    messageId: string
    messageCreatedAt: string
    infoTypes: ContactInfoCaptureInfoType[]
    /** Set on a continuation run of the history search. */
    cursor?: ContactInfoCaptureSearchCursor
    /** Set once the search attributed the message, while the recipient state is awaited. */
    source?: ContactInfoCaptureJobSource
    /** Recipient-state waits already used. */
    recipientWaits?: number
  }
}

/** Delays before each recipient-state re-check; after the last one the capture is dropped. */
export const CONTACT_INFO_CAPTURE_RECIPIENT_WAIT_MS = [
  30 * 1000,
  5 * 60 * 1000,
  30 * 60 * 1000,
] as const

/** Attempts per job run: a read failure (e.g. one message shard down) is retried, never decided on. */
const CONTACT_INFO_CAPTURE_ATTEMPTS = 5
const CONTACT_INFO_CAPTURE_BACKOFF_MS = 10_000

/**
 * One job per (inbound message, step): `s{run}` for history-search runs,
 * `w{n}` for recipient waits. A redelivered event or a retried enqueue lands on
 * the same id, so it is dropped while the original is retained. BullMQ custom
 * ids must not contain ":".
 */
export const contactInfoCaptureJobId = (
  messageId: string,
  step: string,
): string => `contact-info-capture-${messageId}-${step}`

/** Job options shared by every enqueue of this queue. */
const contactInfoCaptureJobOptions = {
  ...defaultJobOptions,
  attempts: CONTACT_INFO_CAPTURE_ATTEMPTS,
  backoff: {
    type: "exponential",
    delay: CONTACT_INFO_CAPTURE_BACKOFF_MS,
  },
  // Retained (not `true`) so a duplicate delivery of the same id is dropped.
  removeOnComplete: { age: 24 * 60 * 60, count: 20_000 },
  removeOnFail: { age: 24 * 60 * 60, count: 5000 },
}

export const contactInfoCaptureQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<ContactInfoCaptureJobData>(queueNames.enum.contactInfoCapture, {
      connection: getQueueConnection(queueNames.enum.contactInfoCapture),
      defaultJobOptions: contactInfoCaptureJobOptions,
    })

/**
 * The producer-side shape of one capture job, so the event listener, the
 * continuation runs and the recipient waits all build ids and options the same
 * way. `delayMs` parks the job in BullMQ's delayed set (recipient waits).
 */
export const buildContactInfoCaptureJob = (
  data: ContactInfoCaptureJobData["data"],
  step: string,
  delayMs?: number,
): {
  name: typeof ContactInfoCaptureJobAction.capture
  data: ContactInfoCaptureJobData
  opts: { jobId: string; delay?: number }
} => ({
  name: ContactInfoCaptureJobAction.capture,
  data: { type: ContactInfoCaptureJobAction.capture, data },
  opts: {
    jobId: contactInfoCaptureJobId(data.messageId, step),
    ...(delayMs ? { delay: delayMs } : {}),
  },
})
