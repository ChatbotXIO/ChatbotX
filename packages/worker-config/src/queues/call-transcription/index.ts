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
 * Speech-to-text over a stored call recording. A dedicated queue (not the shared
 * `integration` queue) so a BullMQ `limiter` can bound transcriptions/minute
 * independent of other integration traffic. Channel-agnostic envelope so a future
 * calling channel can reuse it without a WhatsApp-specific type.
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
