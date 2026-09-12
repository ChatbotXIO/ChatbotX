import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

export const CallTranscriptionJobAction = {
  transcribeCall: "transcribeCall",
} as const

/**
 * Speech-to-text over a stored call recording. A dedicated
 * queue — not the shared `integration` queue — so a BullMQ `limiter` can
 * bound how many transcriptions run per minute regardless of how much other
 * integration traffic is in flight, without needing a second worker
 * concurrency knob shared across unrelated job types. Channel-agnostic
 * envelope (`channel` discriminator) so a future calling channel can reuse
 * this queue without a WhatsApp-specific type.
 */
export type CallTranscriptionJobTranscribeCall = {
  type: typeof CallTranscriptionJobAction.transcribeCall
  data: {
    channel: "whatsapp"
    /** `WhatsappCall.id` (bigint string) — never a wacid/attemptId. */
    callId: string
    /** Enables the worker-level blocked-owner guard. */
    workspaceId: string
  }
}

export type CallTranscriptionJobData = CallTranscriptionJobTranscribeCall

/** `transcribe-<callId>` — replay-safe, one transcription attempt per call. */
export const callTranscriptionJobId = (callId: string): string =>
  `transcribe-${callId}`

export const callTranscriptionQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<CallTranscriptionJobData>(queueNames.enum.callTranscription, {
      connection: getRedisConnection(),
      defaultJobOptions,
    })
