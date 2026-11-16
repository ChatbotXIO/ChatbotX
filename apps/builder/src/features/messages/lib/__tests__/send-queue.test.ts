import { describe, expect, test } from "vitest"
import {
  AGENT_SEND_CONFIRM_TIMEOUT_MS,
  AGENT_SEND_GAP_MS,
  createSendQueue,
  discardHeldSends,
  enqueueSend,
  expireInFlightSend,
  failResendSubmit,
  failSendSubmit,
  isSendQueueLocked,
  markResendSubmitted,
  markSendSubmitted,
  nextSendToSubmit,
  nextSendWakeAt,
  type QueuedSend,
  resumeSendQueue,
  type SendQueue,
  settleSend,
} from "../send-queue"

type Input = { text: string }

const send = (clientId: string): QueuedSend<Input> => ({
  clientId,
  input: { text: clientId },
})

const queueWith = (...ids: string[]): SendQueue<Input> =>
  ids.reduce(
    (queue, id) => enqueueSend(queue, send(id)),
    createSendQueue<Input>(),
  )

/** Submits the head of the queue at `now`, as the runner does. */
const submitNext = (queue: SendQueue<Input>, now: number): SendQueue<Input> => {
  const next = nextSendToSubmit(queue, now)
  if (!next) {
    throw new Error("nothing to submit")
  }
  return markSendSubmitted(queue, next.clientId, now)
}

describe("send queue order and gap", () => {
  test("an idle queue sends the first message at once", () => {
    expect(nextSendToSubmit(queueWith("a", "b"), 0)?.clientId).toBe("a")
  })

  test("the next message waits for the previous one's result", () => {
    const queue = submitNext(queueWith("a", "b", "c"), 0)

    expect(nextSendToSubmit(queue, 10_000)).toBeNull()
  })

  test("after the result it waits the gap, then sends in order", () => {
    let queue = submitNext(queueWith("a", "b", "c"), 0)
    queue = settleSend(queue, { clientId: "a", error: null }, 100)

    expect(nextSendToSubmit(queue, 100 + AGENT_SEND_GAP_MS - 1)).toBeNull()
    expect(nextSendToSubmit(queue, 100 + AGENT_SEND_GAP_MS)?.clientId).toBe("b")

    queue = submitNext(queue, 100 + AGENT_SEND_GAP_MS)
    queue = settleSend(queue, { clientId: "b", error: null }, 700)
    expect(nextSendToSubmit(queue, 700 + AGENT_SEND_GAP_MS)?.clientId).toBe("c")
  })

  test("the gap is 500 ms", () => {
    expect(AGENT_SEND_GAP_MS).toBe(500)
  })

  test("a result is matched by message id as well as client id", () => {
    const submitted = submitNext(queueWith("a"), 0)
    const queue: SendQueue<Input> = {
      ...submitted,
      inFlight: { clientId: "a", messageId: "m-1", startedAt: 0 },
    }

    const settled = settleSend(queue, { messageId: "m-1", error: null }, 5)

    expect(settled.inFlight).toBeNull()
  })

  test("a result for a message that is not the one in flight changes nothing", () => {
    const queue = submitNext(queueWith("a", "b"), 0)

    expect(settleSend(queue, { clientId: "other", error: null }, 5)).toBe(queue)
    expect(settleSend(queue, { messageId: "m-9", error: "boom" }, 5)).toBe(
      queue,
    )
  })

  test("a result with nothing in flight changes nothing", () => {
    const queue = queueWith("a")
    expect(settleSend(queue, { clientId: "a", error: null }, 5)).toBe(queue)
  })
})

describe("a failure holds what was already queued behind it", () => {
  test("later messages are held and the queue is locked", () => {
    let queue = submitNext(queueWith("a", "b", "c"), 0)
    queue = settleSend(queue, { clientId: "a", error: "refused" }, 10)

    expect(queue.holdReason).toBe("failed")
    expect(isSendQueueLocked(queue)).toBe(true)
    expect(queue.waiting.map((item) => item.clientId)).toEqual(["b", "c"])
    expect(nextSendToSubmit(queue, 1_000_000)).toBeNull()
  })

  test("a failure with nothing behind it still locks, so a newer message cannot overtake the failed one", () => {
    let queue = submitNext(queueWith("a"), 0)
    queue = settleSend(queue, { clientId: "a", error: "refused" }, 10)

    expect(queue.holdReason).toBe("failed")
    expect(isSendQueueLocked(queue)).toBe(true)

    queue = enqueueSend(queue, send("b"))
    expect(nextSendToSubmit(queue, 10)).toBeNull()
  })

  test("a resend while another message is in flight does not take its place", () => {
    let queue = submitNext(queueWith("b", "c"), 0)

    queue = markResendSubmitted(queue, { messageId: "m-a" }, 20)

    expect(queue.inFlight?.clientId).toBe("b")
    expect(settleSend(queue, { messageId: "m-a", error: null }, 30)).toBe(queue)
  })

  test("a refused resend puts the hold back", () => {
    let queue = submitNext(queueWith("a", "b"), 0)
    queue = settleSend(
      queue,
      { clientId: "a", messageId: "m-a", error: "refused" },
      10,
    )
    queue = markResendSubmitted(queue, { messageId: "m-a" }, 20)

    queue = failResendSubmit(queue, "m-a")

    expect(queue.inFlight).toBeNull()
    expect(queue.holdReason).toBe("failed")
    expect(queue.waiting.map((item) => item.clientId)).toEqual(["b"])
  })

  test("resending a different failed message does not lift a hold that belongs to another", () => {
    let queue = submitNext(queueWith("a", "c"), 0)
    queue = settleSend(
      queue,
      { clientId: "a", messageId: "m-a", error: "refused" },
      10,
    )

    queue = markResendSubmitted(queue, { messageId: "m-old" }, 20)
    expect(queue.holdReason).toBe("failed")
    expect(queue.inFlight?.messageId).toBe("m-old")

    queue = settleSend(queue, { messageId: "m-old", error: null }, 30)
    expect(nextSendToSubmit(queue, 10_000)).toBeNull()

    queue = markResendSubmitted(queue, { messageId: "m-a" }, 40)
    expect(queue.holdReason).toBeNull()
  })

  test("a hold from a refused submit (only the clientId known) is lifted by resending that row", () => {
    let queue = submitNext(queueWith("a", "c"), 0)
    queue = failSendSubmit(queue, "a")

    queue = markResendSubmitted(queue, { messageId: "m-a", clientId: "a" }, 20)

    expect(queue.holdReason).toBeNull()
    expect(queue.inFlight?.messageId).toBe("m-a")
  })

  test("resending the held message while another one is in flight lifts the hold now, so the queue is not stranded", () => {
    let queue = submitNext(queueWith("a", "b"), 0)
    queue = settleSend(
      queue,
      { clientId: "a", messageId: "m-a", error: "refused" },
      10,
    )
    queue = markResendSubmitted(queue, { messageId: "m-old" }, 20)

    queue = markResendSubmitted(queue, { messageId: "m-a", clientId: "a" }, 25)

    expect(queue.holdReason).toBeNull()
    expect(queue.inFlight?.messageId).toBe("m-old")
    queue = settleSend(queue, { messageId: "m-old", error: null }, 30)
    expect(nextSendToSubmit(queue, 30 + AGENT_SEND_GAP_MS)?.clientId).toBe("b")
  })

  test("a refused resend on a queue that was not held leaves it unlocked", () => {
    let queue = markResendSubmitted(
      createSendQueue<unknown>(),
      { messageId: "m-old" },
      0,
    )

    queue = failResendSubmit(queue, "m-old")

    expect(queue.inFlight).toBeNull()
    expect(queue.holdReason).toBeNull()
    expect(isSendQueueLocked(queue)).toBe(false)
  })

  test("a refused resend of another message keeps the hold that was never lifted", () => {
    let queue = submitNext(queueWith("a", "c"), 0)
    queue = settleSend(
      queue,
      { clientId: "a", messageId: "m-a", error: "refused" },
      10,
    )
    queue = markResendSubmitted(queue, { messageId: "m-old" }, 20)

    queue = failResendSubmit(queue, "m-old")

    expect(queue.holdReason).toBe("failed")
    expect(queue.heldBy?.messageId).toBe("m-a")
  })

  test("a refused resend that was never tracked changes nothing", () => {
    const queue = submitNext(queueWith("b"), 0)
    expect(failResendSubmit(queue, "m-a")).toBe(queue)
  })

  test("a successful resend lets the held messages continue, after its own result and gap", () => {
    let queue = submitNext(queueWith("a", "b"), 0)
    queue = settleSend(
      queue,
      { clientId: "a", messageId: "m-a", error: "refused" },
      10,
    )

    queue = markResendSubmitted(queue, { messageId: "m-a" }, 20)
    expect(queue.holdReason).toBeNull()
    expect(isSendQueueLocked(queue)).toBe(false)
    // The resent message is in flight, so "b" still waits for it.
    expect(nextSendToSubmit(queue, 20)).toBeNull()

    queue = settleSend(queue, { messageId: "m-a", error: null }, 100)
    expect(nextSendToSubmit(queue, 100 + AGENT_SEND_GAP_MS)?.clientId).toBe("b")
  })

  test("a resend that fails again holds the queue again", () => {
    let queue = submitNext(queueWith("a", "b"), 0)
    queue = settleSend(
      queue,
      { clientId: "a", messageId: "m-a", error: "refused" },
      10,
    )
    queue = markResendSubmitted(queue, { messageId: "m-a" }, 20)

    queue = settleSend(queue, { messageId: "m-a", error: "refused again" }, 30)

    expect(queue.holdReason).toBe("failed")
    expect(queue.waiting.map((item) => item.clientId)).toEqual(["b"])
  })

  test("the person can discard the held messages", () => {
    let queue = submitNext(queueWith("a", "b", "c"), 0)
    queue = settleSend(queue, { clientId: "a", error: "refused" }, 10)

    queue = discardHeldSends(queue)

    expect(queue.waiting).toEqual([])
    expect(queue.holdReason).toBeNull()
  })

  test("a refused submit (rejection, validation, network) holds like a failure", () => {
    let queue = submitNext(queueWith("a", "b"), 0)

    queue = failSendSubmit(queue, "a")

    expect(queue.inFlight).toBeNull()
    expect(queue.holdReason).toBe("failed")
    expect(queue.waiting.map((item) => item.clientId)).toEqual(["b"])
  })

  test("a refused submit for a message that is not in flight changes nothing", () => {
    const queue = submitNext(queueWith("a", "b"), 0)
    expect(failSendSubmit(queue, "b")).toBe(queue)
  })
})

describe("a lost answer", () => {
  test("after 30 s the queue stops waiting but does NOT send the next message by itself", () => {
    const queue = submitNext(queueWith("a", "b"), 0)

    const expired = expireInFlightSend(queue, AGENT_SEND_CONFIRM_TIMEOUT_MS)

    expect(expired.holdReason).toBe("unconfirmed")
    expect(isSendQueueLocked(expired)).toBe(true)
    expect(
      nextSendToSubmit(expired, 10 * AGENT_SEND_CONFIRM_TIMEOUT_MS),
    ).toBeNull()
  })

  test("before the deadline nothing expires", () => {
    const queue = submitNext(queueWith("a", "b"), 0)
    expect(expireInFlightSend(queue, AGENT_SEND_CONFIRM_TIMEOUT_MS - 1)).toBe(
      queue,
    )
  })

  test("the person chooses to continue and the next message goes", () => {
    let queue = submitNext(queueWith("a", "b"), 0)
    queue = expireInFlightSend(queue, AGENT_SEND_CONFIRM_TIMEOUT_MS)

    queue = resumeSendQueue(queue, 40_000)

    expect(queue.holdReason).toBeNull()
    expect(nextSendToSubmit(queue, 40_000)?.clientId).toBe("b")
  })

  test("an expiry with nothing behind it still asks before the next message goes", () => {
    let queue = submitNext(queueWith("a"), 0)
    queue = expireInFlightSend(queue, AGENT_SEND_CONFIRM_TIMEOUT_MS)

    expect(queue.holdReason).toBe("unconfirmed")
    expect(queue.inFlight).toBeNull()
    expect(isSendQueueLocked(queue)).toBe(true)
  })

  test("a late success after the expiry lifts the hold so the queue goes on", () => {
    let queue = submitNext(queueWith("a", "b"), 0)
    queue = expireInFlightSend(queue, AGENT_SEND_CONFIRM_TIMEOUT_MS)

    queue = settleSend(queue, { clientId: "a", error: null }, 40_000)

    expect(queue.holdReason).toBeNull()
    expect(nextSendToSubmit(queue, 40_000 + AGENT_SEND_GAP_MS)?.clientId).toBe(
      "b",
    )
  })

  test("a late failure after the expiry turns the hold into a failure", () => {
    let queue = submitNext(queueWith("a", "b"), 0)
    queue = expireInFlightSend(queue, AGENT_SEND_CONFIRM_TIMEOUT_MS)

    queue = settleSend(queue, { clientId: "a", error: "refused" }, 40_000)

    expect(queue.holdReason).toBe("failed")
    expect(queue.waiting.map((item) => item.clientId)).toEqual(["b"])
  })

  test("a late answer for some other message changes nothing", () => {
    let queue = submitNext(queueWith("a", "b"), 0)
    queue = expireInFlightSend(queue, AGENT_SEND_CONFIRM_TIMEOUT_MS)

    expect(settleSend(queue, { clientId: "zzz", error: null }, 40_000)).toBe(
      queue,
    )
  })

  test("the timeout is 30 s", () => {
    expect(AGENT_SEND_CONFIRM_TIMEOUT_MS).toBe(30_000)
  })
})

describe("when the runner should look again", () => {
  test("while waiting for a result: at the confirmation deadline", () => {
    const queue = submitNext(queueWith("a", "b"), 1000)
    expect(nextSendWakeAt(queue, 1000)).toBe(
      1000 + AGENT_SEND_CONFIRM_TIMEOUT_MS,
    )
  })

  test("after a result with messages waiting: at the end of the gap", () => {
    let queue = submitNext(queueWith("a", "b"), 0)
    queue = settleSend(queue, { clientId: "a", error: null }, 100)

    expect(nextSendWakeAt(queue, 100)).toBe(100 + AGENT_SEND_GAP_MS)
  })

  test("a held or empty queue never wakes by itself", () => {
    let held = submitNext(queueWith("a", "b"), 0)
    held = settleSend(held, { clientId: "a", error: "refused" }, 10)

    expect(nextSendWakeAt(held, 10)).toBeNull()
    expect(nextSendWakeAt(createSendQueue<Input>(), 10)).toBeNull()
  })
})
