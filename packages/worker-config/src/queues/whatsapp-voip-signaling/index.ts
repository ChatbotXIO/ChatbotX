import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getQueueConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

/**
 * Dedicated queue for WhatsApp VoIP signaling so a 30-60s accept/reject window
 * is never starved behind the shared `integration` queue. The SDP offer/answer
 * lives only in short-TTL Redis (`voip:offer:<wacid>`), never the job payload.
 */
export const WhatsappVoipSignalingJobAction = {
  handleConnect: "handleConnect",
  expireIfUnanswered: "expireIfUnanswered",
  handleOutboundAnswer: "handleOutboundAnswer",
  expireOutboundDial: "expireOutboundDial",
} as const

export type WhatsappVoipSignalingJobHandleConnect = {
  type: typeof WhatsappVoipSignalingJobAction.handleConnect
  data: {
    /** The `WhatsappCall.wacid` from the VoIP-mode connect webhook. Never the SDP. */
    wacid: string
    /** Epoch ms — Meta's 30-60s answer window. Business must accept/reject by then. */
    deadlineAt: number
    /** Resolves the integration (workspace/inbox/Graph auth) in the consumer. Not sensitive. */
    phoneNumberId: string
    /**
     * Epoch ms the connect webhook arrived. The consumer evaluates the number's
     * call hours against THIS, not its own clock: a queue backlog or retry must
     * never push a call that arrived in hours out of them.
     */
    receivedAt: number
  }
}

/**
 * Durable deadline enforcement: a delayed job scheduled by `handleConnect` for
 * `deadlineAt`, fired via BullMQ `delay` — never relies on the Redis
 * control/offer TTL alone. A no-op when the call already reached `accepted` by
 * the time this runs.
 */
export type WhatsappVoipSignalingJobExpireIfUnanswered = {
  type: typeof WhatsappVoipSignalingJobAction.expireIfUnanswered
  data: {
    wacid: string
    deadlineAt: number
    phoneNumberId: string
  }
}

/**
 * Outbound counterpart to `handleConnect`. Keyed by `attemptId`, not `wacid`,
 * because the SDP answer can arrive before the `connect` POST response
 * attaches `wacid` to the pending row.
 */
export type WhatsappVoipSignalingJobHandleOutboundAnswer = {
  type: typeof WhatsappVoipSignalingJobAction.handleOutboundAnswer
  data: {
    /** Correlates the pending `WhatsappCall` row when `wacid` isn't attached yet. */
    attemptId: string
    /**
     * The `WhatsappCall` row id — resolved once by the consumer, never re-
     * derived from the SDP.
     */
    whatsappCallId: string
    /** Present once Meta's `connect` response has attached it; absent if the answer wins the race. */
    wacid?: string
    /** Resolves the workspace for the targeted realtime send. */
    workspaceId: string
  }
}

/**
 * Durable deadline enforcement for the outbound dial/accept window: a delayed
 * job for `deadlineAt` that terminates and finalizes the call if the user has
 * not accepted by then. A no-op when the call already reached `accepted` by the
 * time this runs.
 */
export type WhatsappVoipSignalingJobExpireOutboundDial = {
  type: typeof WhatsappVoipSignalingJobAction.expireOutboundDial
  data: {
    attemptId: string
    whatsappCallId: string
    wacid?: string
    workspaceId: string
    deadlineAt: number
  }
}

export type WhatsappVoipSignalingJobData =
  | WhatsappVoipSignalingJobHandleConnect
  | WhatsappVoipSignalingJobExpireIfUnanswered
  | WhatsappVoipSignalingJobHandleOutboundAnswer
  | WhatsappVoipSignalingJobExpireOutboundDial

/** `voip-signal-<wacid>` — replay-safe, one signaling job per connect webhook delivery. */
export const whatsappVoipSignalingJobId = (wacid: string): string =>
  `voip-signal-${wacid}`

/** `voip-expire-<wacid>` — one durable expiry job per call, distinct from the connect job id. */
export const whatsappVoipExpiryJobId = (wacid: string): string =>
  `voip-expire-${wacid}`

/**
 * `voip-out-answer-<attemptId>` — keyed by `attemptId` (not `wacid`, which may
 * not exist yet) so the answer-forwarding job stays replay-safe across the
 * answer/connect-response race.
 */
export const outboundAnswerJobId = (attemptId: string): string =>
  `voip-out-answer-${attemptId}`

/**
 * `voip-out-expire-<attemptId>` — one durable outbound dial-deadline job per
 * call attempt, distinct from both the inbound expiry id and the answer-
 * forwarding job id above.
 */
export const expireOutboundDialJobId = (attemptId: string): string =>
  `voip-out-expire-${attemptId}`

const whatsappVoipSignalingJobOptions = {
  ...defaultJobOptions,
  removeOnComplete: true,
  removeOnFail: true,
}

/**
 * Fixed (non-exponential) backoff so retries exhaust well inside Meta's answer
 * window. The ~18s window must outlast the lag before the `WhatsappCall` row
 * is created by the separate `whatsappCallEvent` job — `handleConnect` throws
 * `VoipCallRowNotReadyError` until then. Safe to retry: `reserveIncomingCall`
 * is SET-NX idempotent.
 */
export const WHATSAPP_VOIP_SIGNAL_RETRY_OPTIONS = {
  attempts: 10,
  backoff: { type: "fixed", delay: 2000 },
} as const

export const whatsappVoipSignalingQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<WhatsappVoipSignalingJobData>(
      queueNames.enum.whatsappVoipSignaling,
      {
        connection: getQueueConnection(queueNames.enum.whatsappVoipSignaling),
        defaultJobOptions: whatsappVoipSignalingJobOptions,
      },
    )
