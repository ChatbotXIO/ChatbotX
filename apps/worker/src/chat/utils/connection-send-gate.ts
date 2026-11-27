import { connectionStateService } from "@chatbotx.io/business"
import { ChatJobAction, type ChatJobData } from "@chatbotx.io/worker-config"
import { DelayedError, type Job } from "bullmq"
import { deferralsSoFar } from "../../lib/lock-contention-deferral"
import { logger } from "../../lib/logger"

/**
 * How long a send waits for a provider to finish re-onboarding an account. The
 * provider rejects sends meanwhile, so waiting beats failing. The wait backs
 * off (30s, 60s, 120s, 240s, 300s: about 12 minutes in all) so a broadcast to
 * an offboarded number does not turn into a poll storm; afterwards the send
 * proceeds and the channel handler records its own failure exactly as it does
 * for any provider error.
 */
export const CONNECTION_SEND_DEFERRAL_POLICY = {
  maxDeferrals: 5,
  baseDelayMs: 30_000,
  maxDelayMs: 300_000,
} as const

/**
 * The send jobs nothing waits on, each carrying the `contactInbox` it goes to.
 * Flow steps (`sendFlowMessage`) and chat messages (`sendChatMessage`) are
 * deliberately absent: the flow runner awaits each of them to keep steps in
 * order, so parking one would hold an integration-worker slot for the whole
 * wait timeout per step and let a later step overtake an earlier one after the
 * reconnect. They keep today's behaviour: the handler sends and records its own
 * failure.
 *
 * Deferred jobs are re-polled independently (with jitter), so two gated sends
 * to the same conversation made seconds apart can swap order once the account
 * is back. That is accepted for broadcast templates and inbox sends.
 */
const GATED_SEND_ACTIONS = [
  ChatJobAction.sendChannelMessage,
  ChatJobAction.sendWhatsappTemplateMessage,
  ChatJobAction.sendWhatsappTemplateToConversation,
  ChatJobAction.sendMessengerTemplateMessage,
] as const

const GATED_SEND_JOB_TYPES: ReadonlySet<ChatJobData["type"]> = new Set(
  GATED_SEND_ACTIONS,
)

type GatedSendJobData = Extract<
  ChatJobData,
  { type: (typeof GATED_SEND_ACTIONS)[number] }
>

const isGatedSend = (data: ChatJobData): data is GatedSendJobData =>
  GATED_SEND_JOB_TYPES.has(data.type)

/** Exponential backoff with equal jitter, capped at `maxDelayMs`. */
export const deferralDelayMs = (
  deferral: number,
  random: () => number = Math.random,
): number => {
  const ceiling = Math.min(
    CONNECTION_SEND_DEFERRAL_POLICY.baseDelayMs * 2 ** deferral,
    CONNECTION_SEND_DEFERRAL_POLICY.maxDelayMs,
  )
  const half = ceiling / 2
  return Math.round(half + random() * half)
}

/**
 * Holds a send back while its channel account is being re-onboarded by the
 * provider. Runs at the worker boundary, before any handler uploads
 * attachments, inserts a Message or emits an event, so a deferred job leaves no
 * trace and is not a failed attempt. Throws `DelayedError` after parking the
 * job; returns when the send should proceed.
 */
export const deferSendWhileAccountReconnecting = async (
  job: Pick<
    Job<ChatJobData>,
    "id" | "data" | "attemptsStarted" | "attemptsMade" | "moveToDelayed"
  >,
  token: string | undefined,
): Promise<void> => {
  const inboxId = isGatedSend(job.data)
    ? job.data.data.contactInbox?.inboxId
    : undefined
  if (!inboxId || token === undefined) {
    return
  }
  const target = { inboxId }

  // The gate only ever holds a send back; it never blocks one. A failed lookup
  // therefore sends, so the handler keeps its own retry and final-failure path
  // (a throw here on the last attempt would leave the Message pending forever).
  let decision: Awaited<
    ReturnType<typeof connectionStateService.resolveSendDecision>
  >
  try {
    decision = await connectionStateService.resolveSendDecision(target)
  } catch (err) {
    logger.warn(
      { err, jobId: job.id, target },
      "Could not read the account state for a send; sending without the reconnect check",
    )
    return
  }
  if (decision !== "defer") {
    return
  }

  const deferral = deferralsSoFar(job)
  if (deferral >= CONNECTION_SEND_DEFERRAL_POLICY.maxDeferrals) {
    logger.warn(
      { jobId: job.id, target, deferral },
      "Account still reconnecting after the deferral budget; sending anyway",
    )
    return
  }

  const delayMs = deferralDelayMs(deferral)
  logger.info(
    { jobId: job.id, target, deferral, delayMs },
    "Account is reconnecting; deferring send",
  )
  await job.moveToDelayed(Date.now() + delayMs, token)
  throw new DelayedError()
}
