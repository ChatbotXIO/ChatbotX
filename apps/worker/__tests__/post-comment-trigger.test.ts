import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Emission of the post-comment trigger events from comment ingestion: which
// comment is "first", and that a redelivered webhook / retried job never emits
// a second time. Only Redis and the emitters are mocked.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const store = new Map<string, string>()
  return {
    store,
    emitCommented: vi.fn(async (..._args: unknown[]) => undefined),
    emitFirst: vi.fn(async (..._args: unknown[]) => undefined),
    set: vi.fn((key: string, value: string, ...args: string[]) => {
      if (args.includes("NX") && store.has(key)) {
        return Promise.resolve(null)
      }
      store.set(key, value)
      return Promise.resolve("OK")
    }),
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    del: vi.fn((key: string) => {
      store.delete(key)
      return Promise.resolve(1)
    }),
    hasActiveTriggers: vi.fn(async () => true),
    hasActiveWebhooks: vi.fn(async () => false),
    loggerError: vi.fn(),
  }
})

vi.mock("@chatbotx.io/worker-config", () => ({
  getRedisConnection: () => ({
    set: mocks.set,
    get: mocks.get,
    del: mocks.del,
  }),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitContactCommentedOnPost: mocks.emitCommented,
  emitContactFirstCommentedOnPost: mocks.emitFirst,
  hasActiveTriggers: mocks.hasActiveTriggers,
  hasActiveWebhooks: mocks.hasActiveWebhooks,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError },
}))

const {
  claimFirstCommentWinner,
  emitPostCommentTriggers,
  emitPostCommentTriggersBestEffort,
} = await import("../src/integration/handlers/post-comment-trigger")

/** What receiveComment does: name the winner right after the insert, then emit. */
const ingest = async (
  overrides: Partial<Parameters<typeof emitPostCommentTriggers>[0]> = {},
): Promise<void> => {
  const value = input(overrides)
  await claimFirstCommentWinner({
    channelPostId: value.channelPostId,
    commentId: value.commentId,
    contactInboxId: value.contactInboxId,
    outcome: value.outcome,
    workspaceId: value.inbox.workspaceId,
  })
  await emitPostCommentTriggers(value)
}

const COMMENTED_AT = new Date("2026-11-24T10:00:00.000Z")

const input = (
  overrides: Partial<Parameters<typeof emitPostCommentTriggers>[0]> = {},
): Parameters<typeof emitPostCommentTriggers>[0] => ({
  channelPostId: "900",
  commentId: "comment-1",
  commentText: "hello",
  contactId: "contact-1",
  contactInboxId: "ci-1",
  conversationId: "conv-1",
  externalPostId: "page_post_1",
  inbox: { id: "inbox-1", workspaceId: "ws-1", channel: "messenger" },
  outcome: { status: "inserted" },
  savedComment: { id: "msg-1", createdAt: COMMENTED_AT },
  ...overrides,
})

describe("emitPostCommentTriggers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.store.clear()
    mocks.hasActiveTriggers.mockResolvedValue(true)
    mocks.hasActiveWebhooks.mockResolvedValue(false)
  })

  test("the first comment fires both events with the comment's metadata", async () => {
    await ingest()

    const metadata = {
      channelPostId: "900",
      externalPostId: "page_post_1",
      inboxId: "inbox-1",
      channel: "messenger",
      commentId: "comment-1",
      commentMessageId: "msg-1",
      commentMessageCreatedAt: "2026-11-24T10:00:00.000Z",
      commentText: "hello",
      conversationId: "conv-1",
    }
    expect(mocks.emitCommented).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      metadata,
      "ci-1",
      "trigger",
    )
    expect(mocks.emitFirst).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      metadata,
      "ci-1",
      "trigger",
    )
  })

  test("a later comment fires only the every-comment event", async () => {
    await emitPostCommentTriggers(
      input({
        commentId: "comment-2",
        outcome: {
          status: "existing",
          commentedAt: new Date("2026-11-23T10:00:00.000Z"),
        },
      }),
    )

    expect(mocks.emitCommented).toHaveBeenCalledTimes(1)
    expect(mocks.emitFirst).not.toHaveBeenCalled()
  })

  test("a redelivered webhook emits nothing the second time", async () => {
    await ingest()
    await ingest({
      outcome: { status: "existing", commentedAt: COMMENTED_AT },
    })

    expect(mocks.emitCommented).toHaveBeenCalledTimes(1)
    expect(mocks.emitFirst).toHaveBeenCalledTimes(1)
  })

  test("a retry whose first attempt died before emitting still fires first once", async () => {
    // The first attempt inserted the row and set the claim, then died.
    mocks.store.set("post-comment:first:ws-1:ci-1:900", "comment-1")

    await emitPostCommentTriggers(
      input({ outcome: { status: "existing", commentedAt: COMMENTED_AT } }),
    )

    expect(mocks.emitFirst).toHaveBeenCalledTimes(1)
  })

  test("a second comment in the same instant is not also first", async () => {
    await ingest()
    await ingest({
      commentId: "comment-2",
      savedComment: { id: "msg-2", createdAt: COMMENTED_AT },
      outcome: { status: "existing", commentedAt: COMMENTED_AT },
    })

    expect(mocks.emitCommented).toHaveBeenCalledTimes(2)
    expect(mocks.emitFirst).toHaveBeenCalledTimes(1)
  })

  test("two distinct comments of the same second, interleaved, fire first exactly once", async () => {
    // A wins the insert and names itself at once; B (same second, reads
    // "existing") runs its whole emit before A's slow steps reach theirs.
    const winner = input({ commentId: "comment-A" })
    await claimFirstCommentWinner({
      channelPostId: winner.channelPostId,
      commentId: winner.commentId,
      contactInboxId: winner.contactInboxId,
      outcome: winner.outcome,
      workspaceId: winner.inbox.workspaceId,
    })
    await ingest({
      commentId: "comment-B",
      savedComment: { id: "msg-B", createdAt: COMMENTED_AT },
      outcome: { status: "existing", commentedAt: COMMENTED_AT },
    })
    await emitPostCommentTriggers(winner)

    expect(mocks.emitFirst).toHaveBeenCalledTimes(1)
    expect(mocks.emitFirst).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      expect.objectContaining({ commentId: "comment-A" }),
      "ci-1",
      "trigger",
    )
    expect(mocks.emitCommented).toHaveBeenCalledTimes(2)
  })

  test("a missing first-comment claim fails safe: never first", async () => {
    await emitPostCommentTriggers(
      input({ outcome: { status: "existing", commentedAt: COMMENTED_AT } }),
    )

    expect(mocks.emitFirst).not.toHaveBeenCalled()
    expect(mocks.emitCommented).toHaveBeenCalledTimes(1)
  })

  test("an existing outcome never writes the first-comment claim", async () => {
    await emitPostCommentTriggers(
      input({ outcome: { status: "existing", commentedAt: COMMENTED_AT } }),
    )

    expect(mocks.store.has("post-comment:first:ws-1:ci-1:900")).toBe(false)
  })

  test("writes no Redis key when no trigger or webhook listens", async () => {
    mocks.hasActiveTriggers.mockResolvedValue(false)
    mocks.hasActiveWebhooks.mockResolvedValue(false)

    await ingest()

    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.emitCommented).not.toHaveBeenCalled()
    expect(mocks.emitFirst).not.toHaveBeenCalled()
  })

  test("an active webhook alone is enough to claim and emit", async () => {
    mocks.hasActiveTriggers.mockResolvedValue(false)
    mocks.hasActiveWebhooks.mockResolvedValue(true)

    await ingest()

    expect(mocks.emitCommented).toHaveBeenCalledTimes(1)
    expect(mocks.emitFirst).toHaveBeenCalledTimes(1)
  })

  test("a failed enqueue gives the claim back so a redelivery emits again", async () => {
    mocks.emitCommented.mockRejectedValueOnce(new Error("queue down"))

    await expect(ingest()).rejects.toThrow("queue down")
    expect(
      mocks.store.has(
        "post-comment:emitted:inbox-1:comment-1:commented:trigger",
      ),
    ).toBe(false)

    await ingest({ outcome: { status: "existing", commentedAt: COMMENTED_AT } })

    expect(mocks.emitCommented).toHaveBeenCalledTimes(2)
    // The first event was emitted once and its claim kept.
    expect(mocks.emitFirst).toHaveBeenCalledTimes(1)
  })

  test("trigger queue ok + webhook queue fails: a redelivery re-emits only to the webhook", async () => {
    mocks.hasActiveWebhooks.mockResolvedValue(true)
    mocks.emitCommented.mockImplementation((...args: unknown[]) =>
      args[4] === "webhook"
        ? Promise.reject(new Error("webhook queue down"))
        : Promise.resolve(),
    )

    await expect(ingest()).rejects.toThrow("webhook queue down")
    expect(
      mocks.store.has(
        "post-comment:emitted:inbox-1:comment-1:commented:trigger",
      ),
    ).toBe(true)
    expect(
      mocks.store.has(
        "post-comment:emitted:inbox-1:comment-1:commented:webhook",
      ),
    ).toBe(false)

    mocks.emitCommented.mockClear()
    mocks.emitCommented.mockImplementation(async () => undefined)
    await ingest({ outcome: { status: "existing", commentedAt: COMMENTED_AT } })

    expect(mocks.emitCommented).toHaveBeenCalledTimes(1)
    expect(mocks.emitCommented.mock.calls[0]?.[4]).toBe("webhook")
  })

  test("a comment that recorded nothing fires nothing", async () => {
    await emitPostCommentTriggers(input({ outcome: { status: "skipped" } }))

    expect(mocks.emitCommented).not.toHaveBeenCalled()
    expect(mocks.emitFirst).not.toHaveBeenCalled()
  })

  test("a contact whose row was deleted and who comments again is first again", async () => {
    mocks.store.set("post-comment:first:ws-1:ci-1:900", "an-older-comment")

    await emitPostCommentTriggers(input({ commentId: "comment-9" }))

    expect(mocks.emitFirst).toHaveBeenCalledTimes(1)
  })
})

describe("emitPostCommentTriggersBestEffort", () => {
  test("a failing first-comment read orphans no emit and is logged", async () => {
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    mocks.emitCommented.mockRejectedValue(new Error("queue down"))
    mocks.get.mockRejectedValueOnce(new Error("redis get down"))

    await emitPostCommentTriggersBestEffort(
      input({ outcome: { status: "existing", commentedAt: COMMENTED_AT } }),
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
    process.off("unhandledRejection", unhandled)

    expect(unhandled).not.toHaveBeenCalled()
    expect(mocks.loggerError).toHaveBeenCalledOnce()
    mocks.emitCommented.mockImplementation(async () => undefined)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.store.clear()
    mocks.hasActiveTriggers.mockResolvedValue(true)
    mocks.hasActiveWebhooks.mockResolvedValue(false)
  })

  test("logs a failure instead of failing the ingestion job", async () => {
    mocks.set.mockRejectedValueOnce(new Error("redis down"))

    await expect(
      emitPostCommentTriggersBestEffort(input()),
    ).resolves.toBeUndefined()

    expect(mocks.loggerError).toHaveBeenCalledOnce()
    expect(mocks.emitCommented).not.toHaveBeenCalled()
  })
})
