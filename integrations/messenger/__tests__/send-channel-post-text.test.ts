import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendPageMessage, mockSendPrivateReplyMessage } = vi.hoisted(() => ({
  mockSendPageMessage: vi.fn(),
  mockSendPrivateReplyMessage: vi.fn(),
}))

vi.mock("../src/apis/message", () => ({ sendMessage: mockSendPageMessage }))
vi.mock("../src/apis/comment", () => ({
  sendPrivateReplyMessage: mockSendPrivateReplyMessage,
}))
vi.mock("../src/apis/attachment", () => ({ uploadAttachment: vi.fn() }))
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendFlowStep, sendMessage, handledFlowStepTypes } = await import(
  "../src/handlers/message/outgoing-message"
)

const TEXT = "Summer sale\nhttps://www.facebook.com/page/posts/1"

const ctx = {
  auth: {
    tokens: { accessToken: "tok" },
    version: "v20.0",
    metadata: { pageId: "page-1", version: "v20.0" },
  },
  integrationDetail: { personaId: undefined },
} as never

const contact = {
  id: "contact-1",
  sourceId: "psid-1",
  lastIncomingMessageAt: new Date(Date.now() - 60 * 60 * 1000),
} as never

// What the worker hands a text-link channel for a `sendChannelPost` step.
const rewrittenStep = {
  id: "7001",
  nodeId: "node-1",
  stepType: "sendText",
  text: TEXT,
  buttons: [],
}

describe("messenger sends a shared post as plain text", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendPageMessage.mockResolvedValue({
      recipient_id: "psid-1",
      message_id: "m_1",
    })
    mockSendPrivateReplyMessage.mockResolvedValue({
      recipient_id: "psid-1",
      message_id: "m_anchored",
    })
  })

  test("needs no handler of its own: the step is never handed over as sendChannelPost", () => {
    expect(handledFlowStepTypes).not.toContain("sendChannelPost")
    expect(handledFlowStepTypes).toContain("sendText")
  })

  test("a flow step goes out as one text message, with no attachment and no template", async () => {
    await sendFlowStep({
      ctx,
      data: { contact, step: rewrittenStep },
    } as never)

    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    const payload = mockSendPageMessage.mock.calls[0]?.[1] as {
      recipient: { id: string }
      message: Record<string, unknown>
    }
    expect(payload.recipient).toEqual({ id: "psid-1" })
    expect(payload.message.text).toBe(TEXT)
    expect(payload.message).not.toHaveProperty("attachment")
    expect(payload.message).not.toHaveProperty("attachments")
  })

  test("a composer message with the post card still goes out as the text it carries", async () => {
    await sendMessage({
      ctx,
      data: {
        contact,
        message: {
          id: "msg-1",
          workspaceId: "ws-1",
          conversationId: "conv-1",
          contentType: "text",
          messageType: "outgoing",
          text: TEXT,
          contentAttributes: {
            type: "channel_post",
            shareMode: "textLink",
            channelPostId: "post-1",
            externalPostId: "ext-1",
            permalink: "https://www.facebook.com/page/posts/1",
            thumbnail: null,
            caption: "Summer sale",
          },
        },
      },
    } as never)

    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    const payload = mockSendPageMessage.mock.calls[0]?.[1] as {
      message: Record<string, unknown>
    }
    expect(payload.message.text).toBe(TEXT)
    expect(payload.message).not.toHaveProperty("attachment")
  })

  test("an unspent comment anchor is used for the text, once", async () => {
    await sendFlowStep({
      ctx,
      data: {
        contact,
        step: rewrittenStep,
        commentAnchor: { commentId: "c-1", replyChannel: "private" },
      },
    } as never)

    expect(mockSendPrivateReplyMessage).toHaveBeenCalledTimes(1)
    expect(mockSendPrivateReplyMessage.mock.calls[0]?.[1]).toBe("c-1")
    expect(mockSendPrivateReplyMessage.mock.calls[0]?.[2]).toMatchObject({
      text: TEXT,
    })
    expect(mockSendPageMessage).not.toHaveBeenCalled()
  })

  test("a spent comment anchor is not used again: the text takes the normal send", async () => {
    await sendFlowStep({
      ctx,
      data: {
        contact,
        step: rewrittenStep,
        commentAnchor: {
          commentId: "c-1",
          replyChannel: "private",
          spent: true,
        },
      },
    } as never)

    expect(mockSendPrivateReplyMessage).not.toHaveBeenCalled()
    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
  })
})
