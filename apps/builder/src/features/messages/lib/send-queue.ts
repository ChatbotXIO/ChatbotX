/**
 * Pure state machine behind the composer's per-conversation send queue.
 *
 * Messages typed in quick succession are sent one at a time: the next one waits
 * for the previous one's result from the channel (the `messageFailed` realtime
 * event, `error: null` meaning accepted) and a short gap, so they reach the
 * customer in order. A failure holds the messages that were already queued
 * behind it. In-memory only (a page reload starts clean), single tab: it orders
 * what this tab sends, not what other tabs or API clients send.
 */

/** Pause between a message being accepted and the next one being sent. */
export const AGENT_SEND_GAP_MS = 500
/** How long to wait for a result before asking the person to decide. */
export const AGENT_SEND_CONFIRM_TIMEOUT_MS = 30_000

export type QueuedSend<TInput> = {
  /** Client-generated id, echoed back by the server in the result event. */
  clientId: string
  input: TInput
  /** The optimistic row shown in the list, marked failed if the submit fails. */
  optimisticMessageId?: string | undefined
}

/** A send handed to the server, waiting for the channel's answer. */
export type InFlightSend = {
  clientId?: string | undefined
  /** Known for a resend; learned from the result event otherwise. */
  messageId?: string | undefined
  startedAt: number
  /** The hold a resend lifted, put back if the server refuses the resend. */
  liftedHold?: { reason: SendQueueHoldReason; heldBy: MessageRef | null }
}

/** Why queued messages are not being sent. */
export const SEND_QUEUE_HOLD_REASONS = {
  /** The message ahead of them failed: resend it (or discard them). */
  failed: "failed",
  /** No answer arrived in time: the person decides whether to go on. */
  unconfirmed: "unconfirmed",
} as const
export type SendQueueHoldReason =
  (typeof SEND_QUEUE_HOLD_REASONS)[keyof typeof SEND_QUEUE_HOLD_REASONS]

export type SendQueue<TInput> = {
  waiting: QueuedSend<TInput>[]
  inFlight: InFlightSend | null
  /** Earliest time the next message may be sent (the gap after the last one). */
  nextAllowedAt: number
  /** Set while the composer is held behind a failure / lost answer. */
  holdReason: SendQueueHoldReason | null
  /** The message the hold is for: only resending it lifts the hold. */
  heldBy: MessageRef | null
}

/** A message by whichever ids are known (the row's, or the submit's). */
type MessageRef = {
  clientId?: string | undefined
  messageId?: string | undefined
}

export type SendResultSignal = {
  messageId?: string | undefined
  clientId?: string | undefined
  /** `null`: the channel accepted it. A string: it failed. */
  error: string | null
}

export const createSendQueue = <TInput>(): SendQueue<TInput> => ({
  waiting: [],
  inFlight: null,
  nextAllowedAt: 0,
  holdReason: null,
  heldBy: null,
})

/** Nothing waiting, in flight or held, and the gap after the last send is over. */
export const isSendQueueIdle = <TInput>(
  queue: SendQueue<TInput>,
  now: number,
): boolean =>
  queue.waiting.length === 0 &&
  queue.inFlight === null &&
  queue.holdReason === null &&
  now >= queue.nextAllowedAt

/**
 * The composer locks while the queue is held, even with nothing waiting: a
 * message typed now would reach the customer before the failed one is resent.
 */
export const isSendQueueLocked = <TInput>(queue: SendQueue<TInput>): boolean =>
  queue.holdReason !== null

export const enqueueSend = <TInput>(
  queue: SendQueue<TInput>,
  item: QueuedSend<TInput>,
): SendQueue<TInput> => ({ ...queue, waiting: [...queue.waiting, item] })

/** The message to submit now, or `null` (busy, held, gap not over, or empty). */
export const nextSendToSubmit = <TInput>(
  queue: SendQueue<TInput>,
  now: number,
): QueuedSend<TInput> | null => {
  if (queue.inFlight !== null || queue.holdReason !== null) {
    return null
  }
  if (now < queue.nextAllowedAt) {
    return null
  }
  return queue.waiting[0] ?? null
}

export const markSendSubmitted = <TInput>(
  queue: SendQueue<TInput>,
  clientId: string,
  now: number,
): SendQueue<TInput> => ({
  ...queue,
  waiting: queue.waiting.filter((item) => item.clientId !== clientId),
  inFlight: { clientId, startedAt: now },
})

/**
 * A resent message becomes the one in flight. When it is the message the hold
 * is for, the hold is lifted: held messages go once it is accepted (or hold
 * again if it fails). Resending some other failed message does not lift a hold
 * that belongs to a different one, or the held messages would overtake it.
 * While another message is still in flight the resend is not tracked at all.
 */
export const markResendSubmitted = <TInput>(
  queue: SendQueue<TInput>,
  message: { messageId: string; clientId?: string | null | undefined },
  now: number,
): SendQueue<TInput> => {
  const { messageId } = message
  if (queue.inFlight !== null) {
    // Another message is in flight, so this resend is not tracked. If it is
    // the very message the hold is for, the hold goes now: it is queued again, and
    // keeping the hold would strand what is queued behind it.
    return queue.holdReason !== null &&
      queue.heldBy !== null &&
      sameMessage(queue.heldBy, {
        messageId,
        clientId: message.clientId ?? undefined,
      })
      ? { ...queue, holdReason: null, heldBy: null }
      : queue
  }
  const liftsHold =
    queue.holdReason !== null &&
    (queue.heldBy === null ||
      sameMessage(queue.heldBy, {
        messageId,
        clientId: message.clientId ?? undefined,
      }))
  return {
    ...queue,
    inFlight: {
      messageId,
      startedAt: now,
      ...(liftsHold && queue.holdReason !== null
        ? { liftedHold: { reason: queue.holdReason, heldBy: queue.heldBy } }
        : {}),
    },
    holdReason: liftsHold ? null : queue.holdReason,
    heldBy: liftsHold ? null : queue.heldBy,
  }
}

/**
 * The server refused a resend: back to exactly the state before the click, the
 * hold it lifted (if any) included. A queue that was not held stays unlocked.
 */
export const failResendSubmit = <TInput>(
  queue: SendQueue<TInput>,
  messageId: string,
): SendQueue<TInput> => {
  if (queue.inFlight?.messageId !== messageId) {
    return queue
  }
  const lifted = queue.inFlight.liftedHold
  return {
    ...queue,
    inFlight: null,
    holdReason: lifted?.reason ?? queue.holdReason,
    heldBy: lifted ? lifted.heldBy : queue.heldBy,
  }
}

/** True when this queue is held for the given message. */
export const isHeldBy = <TInput>(
  queue: SendQueue<TInput>,
  message: MessageRef,
): boolean =>
  queue.holdReason !== null &&
  queue.heldBy !== null &&
  sameMessage(queue.heldBy, message)

const sameMessage = (a: MessageRef, b: MessageRef): boolean =>
  (a.clientId !== undefined && a.clientId === b.clientId) ||
  (a.messageId !== undefined && a.messageId === b.messageId)

/** Holds the queue for `culprit`; an existing hold keeps its own culprit. */
const holdQueue = <TInput>(
  queue: SendQueue<TInput>,
  reason: SendQueueHoldReason,
  culprit: MessageRef,
): SendQueue<TInput> => ({
  ...queue,
  inFlight: null,
  holdReason: queue.holdReason ?? reason,
  heldBy: queue.holdReason === null ? culprit : queue.heldBy,
})

const matchesInFlight = (
  inFlight: InFlightSend,
  signal: SendResultSignal,
): boolean =>
  (signal.clientId !== undefined && signal.clientId === inFlight.clientId) ||
  (signal.messageId !== undefined && signal.messageId === inFlight.messageId)

/**
 * The answer for a message the queue already stopped waiting for (the 30 s
 * "unconfirmed" hold): it is now known, so the hold becomes a failure or ends.
 * Any other message's answer changes nothing.
 */
const settleLateSend = <TInput>(
  queue: SendQueue<TInput>,
  signal: SendResultSignal,
  now: number,
): SendQueue<TInput> => {
  const isLateAnswer =
    queue.holdReason === SEND_QUEUE_HOLD_REASONS.unconfirmed &&
    queue.heldBy !== null &&
    sameMessage(queue.heldBy, signal)
  if (!isLateAnswer) {
    return queue
  }
  if (signal.error === null) {
    return {
      ...queue,
      holdReason: null,
      heldBy: null,
      nextAllowedAt: now + AGENT_SEND_GAP_MS,
    }
  }
  return { ...queue, holdReason: SEND_QUEUE_HOLD_REASONS.failed }
}

/**
 * Applies the channel's answer. A result for a message that is not the one in
 * flight (another tab's, an old retry, the clearing of an error) changes
 * nothing.
 */
export const settleSend = <TInput>(
  queue: SendQueue<TInput>,
  signal: SendResultSignal,
  now: number,
): SendQueue<TInput> => {
  if (!(queue.inFlight && matchesInFlight(queue.inFlight, signal))) {
    return settleLateSend(queue, signal, now)
  }
  if (signal.error === null) {
    return {
      ...queue,
      inFlight: null,
      nextAllowedAt: now + AGENT_SEND_GAP_MS,
    }
  }
  return holdQueue(queue, SEND_QUEUE_HOLD_REASONS.failed, {
    clientId: queue.inFlight.clientId,
    messageId: signal.messageId ?? queue.inFlight.messageId,
  })
}

/** The server refused the submit itself (rejection, validation, network). */
export const failSendSubmit = <TInput>(
  queue: SendQueue<TInput>,
  clientId: string,
): SendQueue<TInput> =>
  queue.inFlight?.clientId === clientId
    ? holdQueue(queue, SEND_QUEUE_HOLD_REASONS.failed, { clientId })
    : queue

/** The time at which the in-flight message stops being waited for, if any. */
export const sendConfirmDeadline = <TInput>(
  queue: SendQueue<TInput>,
): number | null =>
  queue.inFlight
    ? queue.inFlight.startedAt + AGENT_SEND_CONFIRM_TIMEOUT_MS
    : null

/**
 * No answer in time: stop waiting, but never send the next message by itself
 * (the one in flight may well have been delivered).
 */
export const expireInFlightSend = <TInput>(
  queue: SendQueue<TInput>,
  now: number,
): SendQueue<TInput> => {
  const deadline = sendConfirmDeadline(queue)
  if (deadline === null || now < deadline) {
    return queue
  }
  return holdQueue(queue, SEND_QUEUE_HOLD_REASONS.unconfirmed, {
    clientId: queue.inFlight?.clientId,
    messageId: queue.inFlight?.messageId,
  })
}

/** The person chose to go on after an unconfirmed message. */
export const resumeSendQueue = <TInput>(
  queue: SendQueue<TInput>,
  now: number,
): SendQueue<TInput> => ({
  ...queue,
  holdReason: null,
  heldBy: null,
  nextAllowedAt: now,
})

/** Drops the held messages (and the hold); the failed one is untouched. */
export const discardHeldSends = <TInput>(
  queue: SendQueue<TInput>,
): SendQueue<TInput> => ({
  ...queue,
  waiting: [],
  holdReason: null,
  heldBy: null,
})

/**
 * When the runner should look at this queue again, or `null` when only an
 * event (a result, a click) can move it: the end of the gap before the next
 * message, or the confirmation deadline of the one in flight.
 */
export const nextSendWakeAt = <TInput>(
  queue: SendQueue<TInput>,
  now: number,
): number | null => {
  const deadline = sendConfirmDeadline(queue)
  if (deadline !== null) {
    return deadline
  }
  if (queue.holdReason === null && queue.waiting.length > 0) {
    return Math.max(queue.nextAllowedAt, now)
  }
  return null
}
