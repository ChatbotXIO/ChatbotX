import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  recordMessageSendError: vi.fn(),
  settleCommentAutomationFailure: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("../src/chat/handlers/send-message", () => ({
  recordMessageSendError: mocks.recordMessageSendError,
}))
vi.mock("../src/lib/comment-automation-anchor", () => ({
  settleCommentAutomationFailure: mocks.settleCommentAutomationFailure,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError, info: vi.fn(), warn: vi.fn() },
}))

const { BOT_MESSAGE_QUOTA_REACHED_ERROR, recordQuotaSkippedSend } =
  await import("../src/chat/handlers/record-quota-skipped-send")

type JobData = Parameters<typeof recordQuotaSkippedSend>[0]

const createdAt = "2026-11-14T00:00:00.000Z"
const commentReplyAttributes = {
  replyToCommentId: "comment-1",
  commentAutomation: { automationId: "automation-1", replyChannel: "public" },
}

function channelMessageJob(
  message: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): JobData {
  return {
    type: "sendChannelMessage",
    data: {
      conversation: { id: "conversation-1", workspaceId: "workspace-1" },
      contactInbox: { id: "contact-inbox-1" },
      message: {
        id: "message-1",
        clientId: "client-1",
        createdAt,
        senderType: "bot",
        ...message,
      },
      ...extra,
    },
  } as unknown as JobData
}

function flowMessageJob(commentAnchor?: Record<string, unknown>): JobData {
  return {
    type: "sendFlowMessage",
    data: { commentAnchor },
  } as unknown as JobData
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("recordQuotaSkippedSend", () => {
  test("marks an existing channel message failed with the quota reason", async () => {
    await recordQuotaSkippedSend(
      channelMessageJob({ contentAttributes: commentReplyAttributes }),
    )

    expect(mocks.recordMessageSendError).toHaveBeenCalledWith(
      "message-1",
      "client-1",
      "workspace-1",
      new Date(createdAt),
      BOT_MESSAGE_QUOTA_REACHED_ERROR,
      { conversationId: "conversation-1", silent: false },
    )
    expect(mocks.settleCommentAutomationFailure).toHaveBeenCalledWith({
      contentAttributes: commentReplyAttributes,
      errorDetail: BOT_MESSAGE_QUOTA_REACHED_ERROR,
    })
  })

  test("keeps a bulk broadcast message out of realtime", async () => {
    await recordQuotaSkippedSend(
      channelMessageJob(
        {},
        { isBulkBroadcast: true, metadata: { type: "broadcast" } },
      ),
    )

    expect(mocks.recordMessageSendError).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      BOT_MESSAGE_QUOTA_REACHED_ERROR,
      { conversationId: "conversation-1", silent: true },
    )
  })

  test("settles a comment-automation flow reply failed", async () => {
    await recordQuotaSkippedSend(
      flowMessageJob({
        commentId: "comment-1",
        replyChannel: "private",
        automationId: "automation-1",
      }),
    )

    expect(mocks.recordMessageSendError).not.toHaveBeenCalled()
    expect(mocks.settleCommentAutomationFailure).toHaveBeenCalledWith({
      contentAttributes: {
        replyToCommentId: "comment-1",
        commentAutomation: {
          automationId: "automation-1",
          replyChannel: "private",
        },
      },
      errorDetail: BOT_MESSAGE_QUOTA_REACHED_ERROR,
    })
  })

  test.each([
    ["no anchor", undefined],
    [
      "an anchor without an automation",
      { commentId: "comment-1", replyChannel: "private" },
    ],
    [
      "a spent anchor (first DM already delivered)",
      {
        commentId: "comment-1",
        replyChannel: "private",
        automationId: "automation-1",
        spent: true,
      },
    ],
  ])("leaves a flow message with %s untouched", async (_name, anchor) => {
    await recordQuotaSkippedSend(flowMessageJob(anchor))

    expect(mocks.settleCommentAutomationFailure).not.toHaveBeenCalled()
  })

  test("does nothing for a send whose message is created by the handler", async () => {
    await recordQuotaSkippedSend({
      type: "sendChatMessage",
      data: {},
    } as unknown as JobData)

    expect(mocks.recordMessageSendError).not.toHaveBeenCalled()
    expect(mocks.settleCommentAutomationFailure).not.toHaveBeenCalled()
  })

  test("swallows its own failures so the job is still dropped", async () => {
    mocks.recordMessageSendError.mockRejectedValueOnce(new Error("db down"))

    await expect(
      recordQuotaSkippedSend(channelMessageJob({})),
    ).resolves.toBeUndefined()
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.any(String),
    )
  })
})
