import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Post-comment events: queued with their metadata, allowed through the trigger
// emitter's worker-context loop guard (only a contact's own comment produces
// them), while an ordinary event is still silenced there.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  triggerQueueAdd: vi.fn(async () => undefined),
  hasActiveTriggers: vi.fn(async () => true),
  isWorkerContext: vi.fn(() => false),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  triggerQueue: { add: (...args: unknown[]) => mocks.triggerQueueAdd(...args) },
}))

vi.mock("../src/trigger/cache", () => ({
  hasActiveTriggers: (...args: unknown[]) => mocks.hasActiveTriggers(...args),
}))

vi.mock("../src/trigger/context", () => ({
  isWorkerContext: () => mocks.isWorkerContext(),
}))

const { TriggerEventEmitter } = await import("../src/trigger/emitter")
const { extractPostCommentRef } = await import("../src/post-comment-context")

const metadata = {
  channelPostId: "900",
  externalPostId: "page_post_1",
  inboxId: "7",
  channel: "messenger",
  commentId: "comment_1",
  commentMessageId: "5000",
  commentMessageCreatedAt: "2026-11-24T10:00:00.000Z",
  commentText: "hello",
  conversationId: "300",
}

describe("post-comment events", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasActiveTriggers.mockResolvedValue(true)
    mocks.isWorkerContext.mockReturnValue(false)
  })

  test.each([
    "contactCommentedOnPost",
    "contactFirstCommentedOnPost",
  ] as const)("%s reaches the queue with its metadata and the contact inbox", async (eventType) => {
    await TriggerEventEmitter.postComment(
      eventType,
      "ws-1",
      "contact-1",
      metadata,
      "ci-1",
    )

    expect(mocks.triggerQueueAdd).toHaveBeenCalledTimes(1)
    const [, job] = mocks.triggerQueueAdd.mock.calls[0] as [
      string,
      { data: { eventType: string; eventData: Record<string, unknown> } },
    ]
    expect(job.data.eventType).toBe(eventType)
    expect(job.data.eventData).toEqual({ ...metadata, contactInboxId: "ci-1" })
  })

  test("queues with a deterministic job id from the comment message and event", async () => {
    await TriggerEventEmitter.postComment(
      "contactFirstCommentedOnPost",
      "ws-1",
      "contact-1",
      metadata,
    )

    const [, , opts] = mocks.triggerQueueAdd.mock.calls[0] as unknown as [
      string,
      unknown,
      { jobId?: string },
    ]
    expect(opts.jobId).toBe("post-comment-contactFirstCommentedOnPost-5000")
  })

  test("is not silenced by the worker-context loop guard", async () => {
    mocks.isWorkerContext.mockReturnValue(true)

    await TriggerEventEmitter.postComment(
      "contactCommentedOnPost",
      "ws-1",
      "contact-1",
      metadata,
    )

    expect(mocks.triggerQueueAdd).toHaveBeenCalledTimes(1)
  })

  test("an event a trigger action can cause is still silenced in worker context", async () => {
    mocks.isWorkerContext.mockReturnValue(true)

    await TriggerEventEmitter.tagApplied("ws-1", "contact-1", "tag-1")

    expect(mocks.triggerQueueAdd).not.toHaveBeenCalled()
  })

  test("nothing is queued when no active trigger listens", async () => {
    mocks.hasActiveTriggers.mockResolvedValue(false)

    await TriggerEventEmitter.postComment(
      "contactFirstCommentedOnPost",
      "ws-1",
      "contact-1",
      metadata,
    )

    expect(mocks.triggerQueueAdd).not.toHaveBeenCalled()
  })
})

describe("extractPostCommentRef", () => {
  test("reads the comment's ids from a post-comment event", () => {
    expect(extractPostCommentRef("contactCommentedOnPost", metadata)).toEqual({
      channelPostId: "900",
      commentMessageId: "5000",
      commentMessageCreatedAt: "2026-11-24T10:00:00.000Z",
    })
  })

  test("is undefined for any other event type", () => {
    expect(extractPostCommentRef("tagApplied", metadata)).toBeUndefined()
  })

  test("is undefined for a malformed bag", () => {
    expect(
      extractPostCommentRef("contactCommentedOnPost", { channelPostId: "1" }),
    ).toBeUndefined()
  })
})
