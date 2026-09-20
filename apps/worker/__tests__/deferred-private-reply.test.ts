import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindContactInboxBy,
  mockIncrementRepliesCount,
  mockCreateMessageRepository,
  mockFindBySourceId,
  mockIdentifyInbox,
  mockIntegrationQueueAdd,
  mockSendTiktokPrivateReply,
  mockRecordEvent,
  mockContactVariableGetAll,
  mockContactVariableReplaceAll,
  mockLoggerInfo,
} = vi.hoisted(() => ({
  mockFindContactInboxBy: vi.fn(),
  mockIncrementRepliesCount: vi.fn(),
  mockCreateMessageRepository: vi.fn(),
  mockFindBySourceId: vi.fn(),
  mockIdentifyInbox: vi.fn(),
  mockIntegrationQueueAdd: vi.fn(),
  mockSendTiktokPrivateReply: vi.fn(),
  mockRecordEvent: vi.fn(),
  mockContactVariableGetAll: vi.fn(),
  mockContactVariableReplaceAll: vi.fn(),
  mockLoggerInfo: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  commentAutomationService: {
    incrementRepliesCount: mockIncrementRepliesCount,
  },
  contactInboxService: { findBy: mockFindContactInboxBy },
  conversationService: {
    findDMByContact: vi.fn(),
    findOrCreate: vi.fn(),
  },
  logProviderError: vi.fn(),
}))

vi.mock("@chatbotx.io/analytics", () => ({
  commentAutomationAnalyticsService: {
    recordEvent: mockRecordEvent,
    settleEvent: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mockCreateMessageRepository,
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  sendPrivateReply: vi.fn(),
}))
vi.mock("@chatbotx.io/integration-instagram", () => ({
  sendPrivateReply: vi.fn(),
}))
vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  sendPrivateReply: vi.fn(),
}))
vi.mock("@chatbotx.io/integration-tiktok", () => ({
  sendPrivateReply: mockSendTiktokPrivateReply,
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: mockContactVariableGetAll,
    replaceAll: mockContactVariableReplaceAll,
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  AIJobAction: { commentAIReply: "commentAIReply" },
  aiAgentQueue: { add: vi.fn() },
  IntegrationJobAction: {
    sendFlow: "sendFlow",
    deferredCommentPrivateReply: "deferredCommentPrivateReply",
  },
  integrationQueue: { add: mockIntegrationQueueAdd },
}))

vi.mock("../src/services/integrations", () => ({
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: mockIdentifyInbox,
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: mockLoggerInfo,
    debug: vi.fn(),
  },
}))

const { runDeferredCommentPrivateReply } = await import(
  "../src/integration/handlers/comment-automation/deferred-private-reply"
)

const COMMENT_ID = "7247303576418566913"
const NOW = new Date("2026-07-10T00:00:00Z")

const buildData = (overrides: Record<string, unknown> = {}) => ({
  integrationType: "tiktok",
  integrationIdentifier: "open-1",
  workspaceId: "workspace-1",
  automationId: "automation-1",
  channelType: "tiktok" as const,
  commentId: COMMENT_ID,
  postId: "video-1",
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  message: "how much?",
  createdTime: Math.floor(NOW.getTime() / 1000),
  occurredAtIso: NOW.toISOString(),
  privateReply: { type: "text" as const, value: "here you go" },
  dedup: {
    automationId: "automation-1",
    contactId: "contact-1",
    postId: "video-1",
    workspaceId: "workspace-1",
  },
  attempt: 0,
  ...overrides,
})

const flaggedComment = {
  id: "message-1",
  createdAt: NOW,
  contentAttributes: {
    postId: "video-1",
    tiktokHighIntent: { at: NOW.toISOString() },
  },
}

const unflaggedComment = {
  id: "message-1",
  createdAt: NOW,
  contentAttributes: { postId: "video-1" },
}

describe("runDeferredCommentPrivateReply", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    mockFindContactInboxBy.mockResolvedValue({
      id: "contact-inbox-1",
      contactId: "contact-1",
      channel: "tiktok",
    })
    mockCreateMessageRepository.mockResolvedValue({
      findBySourceId: mockFindBySourceId,
    })
    mockIdentifyInbox.mockResolvedValue({
      integrationRow: {
        auth: { tokens: { accessToken: "token" }, metadata: { openId: "biz" } },
      },
    })
    mockSendTiktokPrivateReply.mockResolvedValue("msg-1")
    mockRecordEvent.mockResolvedValue(undefined)
    mockIncrementRepliesCount.mockResolvedValue(undefined)
    mockContactVariableGetAll.mockResolvedValue({})
    mockContactVariableReplaceAll.mockImplementation(
      ({ text }: { text: string }) => Promise.resolve(text),
    )
    mockIntegrationQueueAdd.mockResolvedValue(undefined)
  })

  test("re-enqueues itself while the comment is still unflagged", async () => {
    mockFindBySourceId.mockResolvedValue(unflaggedComment)

    await runDeferredCommentPrivateReply(buildData())

    expect(mockSendTiktokPrivateReply).not.toHaveBeenCalled()
    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "deferredCommentPrivateReply",
      expect.objectContaining({
        data: expect.objectContaining({ attempt: 1 }),
      }),
      expect.objectContaining({ attempts: 1 }),
    )
  })

  test("sends once TikTok has flagged the comment", async () => {
    mockFindBySourceId.mockResolvedValue(flaggedComment)

    await runDeferredCommentPrivateReply(buildData())

    expect(mockSendTiktokPrivateReply).toHaveBeenCalledWith(
      expect.anything(),
      COMMENT_ID,
      "here you go",
    )
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ replyChannel: "private", status: "sent" }),
    )
  })

  // On this channel the counters measure the DM, and nothing had gone out until
  // now — the main pass deliberately left this to the deferred job.
  test("counts the reply only when the DM actually goes out", async () => {
    mockFindBySourceId.mockResolvedValue(flaggedComment)

    await runDeferredCommentPrivateReply(buildData())

    expect(mockIncrementRepliesCount).toHaveBeenCalledWith("automation-1")
  })

  test("records exactly one blocked event when the budget runs out", async () => {
    mockFindBySourceId.mockResolvedValue(unflaggedComment)

    await runDeferredCommentPrivateReply(buildData({ attempt: 2 }))

    expect(mockIntegrationQueueAdd).not.toHaveBeenCalled()
    expect(mockRecordEvent).toHaveBeenCalledTimes(1)
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        replyChannel: "private",
        status: "failed",
        errorDetail: expect.stringContaining("high intent"),
      }),
    )
  })

  // The wait can outlast the send window; recorded rather than attempted so the
  // workspace sees why nothing arrived.
  test("records a blocked event when the 48-hour window has closed", async () => {
    mockFindBySourceId.mockResolvedValue(flaggedComment)
    vi.setSystemTime(new Date("2026-07-13T00:00:00Z"))

    await runDeferredCommentPrivateReply(buildData())

    expect(mockSendTiktokPrivateReply).not.toHaveBeenCalled()
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorDetail: expect.stringContaining("48-hour"),
      }),
    )
  })

  // The integration can be disconnected during the 45s–13min wait. With
  // `attempts: 1` a throw out of this handler dies leaving no `failed` row and
  // no Error Log entry — while the dedup row has already claimed the comment,
  // so nothing else will ever answer it.
  test("records a failure instead of dying when the integration went away", async () => {
    mockFindBySourceId.mockResolvedValue(flaggedComment)
    mockIdentifyInbox.mockRejectedValue(new Error("Integration not found"))

    await expect(
      runDeferredCommentPrivateReply(buildData()),
    ).resolves.toBeUndefined()

    expect(mockRecordEvent).toHaveBeenCalledTimes(1)
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        replyChannel: "private",
        status: "failed",
        errorDetail: expect.stringContaining("Integration not found"),
      }),
    )
  })

  // `processCommentAutomation` rejects a flow DM on this channel before
  // deferring, so reaching the executor with one means the two gates disagree.
  // The comment's single DM budget is already spent by then, so it has to leave
  // a row rather than return silently.
  test("records a blocked event when the executor declines what the gate accepted", async () => {
    mockFindBySourceId.mockResolvedValue(flaggedComment)

    await runDeferredCommentPrivateReply(
      buildData({ privateReply: { type: "flow", value: "flow-1" } }),
    )

    expect(mockSendTiktokPrivateReply).not.toHaveBeenCalled()
    expect(mockIncrementRepliesCount).not.toHaveBeenCalled()
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        replyChannel: "private",
        status: "failed",
        errorDetail: expect.stringContaining("not deliverable"),
      }),
    )
  })

  // The deferral wait is not the automation's `replyAfter`. A 10-minute
  // `replyAfter` whose flag lands at the 45-second re-check still owes 9¼
  // minutes; the old hardcoded `delay: 0` sent it immediately.
  test("spends what is left of replyAfter rather than dropping it", async () => {
    mockFindBySourceId.mockResolvedValue(flaggedComment)
    vi.setSystemTime(new Date(NOW.getTime() + 45_000))

    await runDeferredCommentPrivateReply(
      buildData({
        delay: 600_000,
        privateReply: { type: "AIAgent", value: "agent-1" },
      }),
    )

    const { aiAgentQueue } = await import("@chatbotx.io/worker-config")
    expect(aiAgentQueue.add).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ delay: 555_000 }),
    )
  })

  // A payload enqueued before `delay` existed must behave exactly as it did.
  test("treats a payload with no delay as immediate", async () => {
    mockFindBySourceId.mockResolvedValue(flaggedComment)

    await runDeferredCommentPrivateReply(
      buildData({ privateReply: { type: "AIAgent", value: "agent-1" } }),
    )

    const { aiAgentQueue } = await import("@chatbotx.io/worker-config")
    expect(aiAgentQueue.add).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ delay: 0 }),
    )
  })

  // The conditions only TikTok can check — commenter under 18, already answered
  // from the app, a DM in the past 24 hours — surface here and nowhere else.
  test("records TikTok's send-time rejection with its own wording", async () => {
    mockFindBySourceId.mockResolvedValue(flaggedComment)
    mockSendTiktokPrivateReply.mockRejectedValue(
      new Error("The comment has already been replied to via direct message"),
    )

    await runDeferredCommentPrivateReply(buildData())

    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorDetail:
          "The comment has already been replied to via direct message",
      }),
    )
    expect(mockIncrementRepliesCount).not.toHaveBeenCalled()
  })
})
