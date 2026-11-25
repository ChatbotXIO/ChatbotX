import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  chargeCommentActionOnce: vi.fn(),
  hasRoom: vi.fn(),
  setIfAbsent: vi.fn(),
  chatQueueAdd: vi.fn(),
  loggerWarn: vi.fn(),
  markReadBySkippedPost: vi.fn(),
  recordPhoneComment: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  channelPostService: { recordPhoneComment: mocks.recordPhoneComment },
  chargeCommentActionOnce: mocks.chargeCommentActionOnce,
  messageUsageService: { hasRoom: mocks.hasRoom },
  conversationService: {
    markReadBySkippedPost: mocks.markReadBySkippedPost,
  },
}))
vi.mock("@chatbotx.io/redis", () => ({
  casStore: { setIfAbsent: mocks.setIfAbsent },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { changeChannelMessageState: "changeChannelMessageState" },
  chatQueue: { add: mocks.chatQueueAdd },
}))
vi.mock("../src/lib/logger", () => ({ logger: { warn: mocks.loggerWarn } }))

const { applyPostCommentSettings, countPhoneComment } = await import(
  "../src/integration/handlers/post-comment-settings"
)

const createdAt = new Date("2026-11-22T10:00:00.000Z")

const input = (
  overrides: Partial<Parameters<typeof applyPostCommentSettings>[0]> = {},
): Parameters<typeof applyPostCommentSettings>[0] => ({
  channelPostId: "post-1",
  channelType: "messenger",
  commentId: "comment-1",
  contactInbox: { id: "ci-1" } as never,
  conversation: { id: "conv-1" } as never,
  isReply: false,
  savedComment: { createdAt, id: "msg-1" },
  settings: {
    hideComments: false,
    hidePhoneComments: false,
    skipComments: false,
  },
  text: "hello",
  workspaceId: "ws-1",
  ...overrides,
})

const withSettings = (
  settings: Partial<Parameters<typeof applyPostCommentSettings>[0]["settings"]>,
) => ({
  hideComments: false,
  hidePhoneComments: false,
  skipComments: false,
  ...settings,
})

describe("applyPostCommentSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasRoom.mockResolvedValue(true)
    mocks.setIfAbsent.mockResolvedValue(true)
    mocks.chargeCommentActionOnce.mockResolvedValue(true)
    mocks.chatQueueAdd.mockResolvedValue(undefined)
    mocks.markReadBySkippedPost.mockResolvedValue(true)
    mocks.recordPhoneComment.mockResolvedValue(undefined)
  })

  test("does nothing for an ordinary comment on a post with no switches", async () => {
    const outcome = await applyPostCommentSettings(input())

    expect(outcome).toEqual({ postHidesComment: false })
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
    expect(mocks.markReadBySkippedPost).not.toHaveBeenCalled()
  })

  test("hides with one job whose id is fixed per comment, so redelivery cannot hide twice", async () => {
    const outcome = await applyPostCommentSettings(
      input({ settings: withSettings({ hideComments: true }) }),
    )

    expect(outcome).toEqual({ postHidesComment: true })
    expect(mocks.chatQueueAdd).toHaveBeenCalledTimes(1)
    expect(mocks.chatQueueAdd).toHaveBeenCalledWith(
      "changeChannelMessageState",
      {
        type: "changeChannelMessageState",
        data: {
          contactInbox: { id: "ci-1" },
          conversation: { id: "conv-1" },
          hidden: true,
          message: { createdAt, id: "msg-1" },
          usageSource: "postCommentSetting",
        },
      },
      { jobId: "post-hide-comment-comment-1" },
    )
  })

  test("hides again on a redelivered comment, relying on the job id to deduplicate", async () => {
    const settings = withSettings({ hideComments: true })

    await applyPostCommentSettings(input({ settings }))
    await applyPostCommentSettings(input({ settings }))

    const jobIds = mocks.chatQueueAdd.mock.calls.map(
      ([, , options]) => options.jobId,
    )
    expect(jobIds).toEqual([
      "post-hide-comment-comment-1",
      "post-hide-comment-comment-1",
    ])
  })

  test("the phone switch hides only a comment that carries a phone number", async () => {
    const settings = withSettings({ hidePhoneComments: true })

    const withPhone = await applyPostCommentSettings(
      input({ settings, text: "call 0912 345 678" }),
    )
    const withoutPhone = await applyPostCommentSettings(
      input({ settings, text: "nice shop" }),
    )
    const noText = await applyPostCommentSettings(
      input({ settings, text: undefined }),
    )

    expect(withPhone.postHidesComment).toBe(true)
    expect(withoutPhone.postHidesComment).toBe(false)
    expect(noText.postHidesComment).toBe(false)
    expect(mocks.chatQueueAdd).toHaveBeenCalledTimes(1)
  })

  test("leaves a comment the channel cannot hide to the automation's own rules", async () => {
    const outcome = await applyPostCommentSettings(
      input({
        channelType: "threads",
        isReply: true,
        settings: withSettings({ hideComments: true }),
      }),
    )

    expect(outcome).toEqual({ postHidesComment: false })
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
  })

  test("still hides a top-level comment on a channel that only hides top-level ones", async () => {
    const outcome = await applyPostCommentSettings(
      input({
        channelType: "threads",
        isReply: false,
        settings: withSettings({ hideComments: true }),
      }),
    )

    expect(outcome.postHidesComment).toBe(true)
  })

  test("marks a skipped post's comment read at the comment's own time", async () => {
    await applyPostCommentSettings(
      input({ settings: withSettings({ skipComments: true }) }),
    )

    expect(mocks.markReadBySkippedPost).toHaveBeenCalledWith({
      conversationId: "conv-1",
      readAt: createdAt,
      workspaceId: "ws-1",
    })
  })

  test("a failing read marker is logged and never thrown", async () => {
    mocks.markReadBySkippedPost.mockRejectedValue(new Error("db down"))

    await expect(
      applyPostCommentSettings(
        input({ settings: withSettings({ skipComments: true }) }),
      ),
    ).resolves.toEqual({ postHidesComment: false })
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
  })

  test("at the message limit the comment is not hidden and the skip is not applied", async () => {
    mocks.hasRoom.mockResolvedValue(false)

    const hide = await applyPostCommentSettings(
      input({ settings: withSettings({ hideComments: true }) }),
    )
    const skip = await applyPostCommentSettings(
      input({ settings: withSettings({ skipComments: true }) }),
    )

    expect(hide).toEqual({ postHidesComment: false })
    expect(skip).toEqual({ postHidesComment: false })
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
    expect(mocks.markReadBySkippedPost).not.toHaveBeenCalled()
    expect(mocks.chargeCommentActionOnce).not.toHaveBeenCalled()
  })

  test("the limit is logged at most once per post and window", async () => {
    mocks.hasRoom.mockResolvedValue(false)
    mocks.setIfAbsent.mockResolvedValueOnce(true).mockResolvedValue(false)
    const settings = withSettings({ hideComments: true })

    await applyPostCommentSettings(input({ settings }))
    await applyPostCommentSettings(input({ settings }))

    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
  })

  test("a post that hides and skips reads the quota once per comment and logs each refused action under its own key", async () => {
    mocks.hasRoom.mockResolvedValue(false)

    await applyPostCommentSettings(
      input({
        settings: withSettings({ hideComments: true, skipComments: true }),
      }),
    )

    expect(mocks.hasRoom).toHaveBeenCalledTimes(1)
    const keys = mocks.setIfAbsent.mock.calls.map((call) => call[0])
    expect(new Set(keys).size).toBe(2)
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(2)
  })

  test("a skip that advanced the read mark charges one message for that comment", async () => {
    await applyPostCommentSettings(
      input({ settings: withSettings({ skipComments: true }) }),
    )

    expect(mocks.chargeCommentActionOnce).toHaveBeenCalledTimes(1)
    expect(mocks.chargeCommentActionOnce).toHaveBeenCalledWith({
      comment: { createdAt, id: "msg-1" },
      key: "quotaChargedSkip",
      workspaceId: "ws-1",
    })
  })

  test("a skip that did not advance (redelivery) charges nothing", async () => {
    mocks.markReadBySkippedPost.mockResolvedValue(false)

    await applyPostCommentSettings(
      input({ settings: withSettings({ skipComments: true }) }),
    )

    expect(mocks.chargeCommentActionOnce).not.toHaveBeenCalled()
  })

  test("a failing skip charge is logged and never fails the ingestion", async () => {
    mocks.chargeCommentActionOnce.mockRejectedValue(new Error("redis down"))

    await expect(
      applyPostCommentSettings(
        input({ settings: withSettings({ skipComments: true }) }),
      ),
    ).resolves.toEqual({ postHidesComment: false })
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
  })

  test("a failing hide enqueue is thrown so the job retries", async () => {
    mocks.chatQueueAdd.mockRejectedValue(new Error("redis down"))

    await expect(
      applyPostCommentSettings(
        input({ settings: withSettings({ hideComments: true }) }),
      ),
    ).rejects.toThrow("redis down")
  })
})

describe("countPhoneComment", () => {
  const countInput = (
    overrides: Partial<Parameters<typeof countPhoneComment>[0]> = {},
  ) => ({
    channelPostId: "post-1",
    savedComment: { createdAt: new Date("2026-11-22T10:00:00.000Z"), id: "m1" },
    text: "my number is 0912 345 678",
    workspaceId: "ws-1",
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.recordPhoneComment.mockResolvedValue(undefined)
  })

  test("counts a comment that carries a phone number, keyed by the stored comment", async () => {
    await countPhoneComment(countInput())

    expect(mocks.recordPhoneComment).toHaveBeenCalledWith({
      comment: { createdAt: new Date("2026-11-22T10:00:00.000Z"), id: "m1" },
      id: "post-1",
      workspaceId: "ws-1",
    })
  })

  test("asks on every delivery: the comment's own mark decides whether it counts again", async () => {
    await countPhoneComment(countInput())
    await countPhoneComment(countInput())

    expect(mocks.recordPhoneComment).toHaveBeenCalledTimes(2)
  })

  test.each([
    ["an order number", "order 12345"],
    ["a short number", "call 12345"],
    ["plain words", "nice shop"],
    ["no text", undefined],
  ])("does not count %s", async (_label, text) => {
    await countPhoneComment(countInput({ text }))

    expect(mocks.recordPhoneComment).not.toHaveBeenCalled()
  })

  test("a failing counter propagates so the job retries and counts it", async () => {
    mocks.recordPhoneComment.mockRejectedValueOnce(new Error("db down"))

    await expect(countPhoneComment(countInput())).rejects.toThrow("db down")

    await countPhoneComment(countInput())
    expect(mocks.recordPhoneComment).toHaveBeenCalledTimes(2)
  })
})

describe("applyPostCommentSettings on a live comment", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasRoom.mockResolvedValue(true)
    mocks.setIfAbsent.mockResolvedValue(true)
    mocks.chargeCommentActionOnce.mockResolvedValue(true)
    mocks.chatQueueAdd.mockResolvedValue(undefined)
    mocks.markReadBySkippedPost.mockResolvedValue(true)
  })

  test.each([
    "instagram",
    "instagramFacebook",
  ] as const)("does not hide an Instagram Live comment (%s) although the post hides comments", async (channelType) => {
    const outcome = await applyPostCommentSettings(
      input({
        channelType,
        isLive: true,
        settings: withSettings({ hideComments: true }),
      }),
    )

    expect(outcome).toEqual({ postHidesComment: false })
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
    expect(mocks.hasRoom).not.toHaveBeenCalled()
  })

  test("does not hide an Instagram Live comment that carries a phone number", async () => {
    const outcome = await applyPostCommentSettings(
      input({
        channelType: "instagramFacebook",
        isLive: true,
        settings: withSettings({ hidePhoneComments: true }),
        text: "call me 0912345678",
      }),
    )

    expect(outcome.postHidesComment).toBe(false)
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
  })

  test("still skips an Instagram Live comment when the post skips comments", async () => {
    await applyPostCommentSettings(
      input({
        channelType: "instagramFacebook",
        isLive: true,
        settings: withSettings({ hideComments: true, skipComments: true }),
      }),
    )

    expect(mocks.markReadBySkippedPost).toHaveBeenCalledTimes(1)
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
  })

  test("hides a Facebook live comment like any other comment", async () => {
    const outcome = await applyPostCommentSettings(
      input({
        channelType: "messenger",
        isLive: true,
        settings: withSettings({ hideComments: true }),
      }),
    )

    expect(outcome).toEqual({ postHidesComment: true })
    expect(mocks.chatQueueAdd).toHaveBeenCalledTimes(1)
  })

  test("still hides an ordinary (not live) Instagram comment", async () => {
    const outcome = await applyPostCommentSettings(
      input({
        channelType: "instagramFacebook",
        isLive: false,
        settings: withSettings({ hideComments: true }),
      }),
    )

    expect(outcome).toEqual({ postHidesComment: true })
  })
})
