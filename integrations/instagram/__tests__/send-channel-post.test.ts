import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendInstagramMessage, mockSendPrivateReplyMessage } = vi.hoisted(
  () => ({
    mockSendInstagramMessage: vi.fn(),
    mockSendPrivateReplyMessage: vi.fn(),
  }),
)

vi.mock("../src/apis/message", () => ({
  sendMessage: mockSendInstagramMessage,
}))

vi.mock("../src/apis/comment", () => ({
  sendPrivateReplyMessage: mockSendPrivateReplyMessage,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { convertMessage, handledFlowStepTypes, sendFlowStep, sendMessage } =
  await import("../src/handlers/message/outgoing-message")
const { toMediaShareAttachment } = await import(
  "../src/handlers/message/outgoing-message/send-attachment"
)

const ctx = {
  auth: {
    tokens: { accessToken: "tok" },
    metadata: { igId: "ig-1", version: "v23.0" },
  },
} as never

const contact = {
  id: "contact-1",
  sourceId: "igsid-1",
  lastIncomingMessageAt: new Date(Date.now() - 60 * 60 * 1000),
} as never

const postStep = {
  id: "7001",
  nodeId: "node-1",
  stepType: "sendChannelPost",
  channelPostId: "post-1",
  externalPostId: "17900000000000001",
}

const postMessage = (
  overrides: Record<string, unknown> = {},
  contentAttributes: Record<string, unknown> | null = {
    type: "channel_post",
    shareMode: "nativeMedia",
    channelPostId: "post-1",
    externalPostId: "17900000000000001",
    permalink: null,
    thumbnail: null,
    caption: null,
  },
) =>
  ({
    id: "msg-1",
    workspaceId: "ws-1",
    conversationId: "conv-1",
    contentType: "text",
    messageType: "outgoing",
    text: null,
    contentAttributes,
    ...overrides,
  }) as never

describe("instagram MEDIA_SHARE", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendInstagramMessage.mockResolvedValue({
      recipient_id: "igsid-1",
      message_id: "m_1",
    })
    mockSendPrivateReplyMessage.mockResolvedValue({
      recipient_id: "igsid-1",
      message_id: "m_anchored",
    })
  })

  test("the attachment is the documented MEDIA_SHARE shape: the post's platform id in payload.id", () => {
    expect(toMediaShareAttachment("17900000000000001")).toEqual({
      type: "MEDIA_SHARE",
      payload: { id: "17900000000000001" },
    })
  })

  test("the flow step handler declares sendChannelPost", () => {
    expect(handledFlowStepTypes).toContain("sendChannelPost")
  })

  test("a flow step sends one message with the MEDIA_SHARE attachment", async () => {
    const result = await sendFlowStep({
      ctx,
      data: { contact, step: postStep },
    } as never)

    expect(mockSendInstagramMessage).toHaveBeenCalledTimes(1)
    expect(mockSendInstagramMessage.mock.calls[0]?.[1]).toMatchObject({
      recipient: { id: "igsid-1" },
      message: {
        attachment: {
          type: "MEDIA_SHARE",
          payload: { id: "17900000000000001" },
        },
      },
      messaging_type: "RESPONSE",
    })
    expect(result).toEqual({ messageIds: ["m_1"], sentCount: 1 })
  })

  test("a flow step without a resolved post fails loudly instead of sending nothing", async () => {
    await expect(
      sendFlowStep({
        ctx,
        data: { contact, step: { ...postStep, externalPostId: undefined } },
      } as never),
    ).rejects.toThrow()
    expect(mockSendInstagramMessage).not.toHaveBeenCalled()
  })

  test("an unspent comment anchor takes the share as its one private reply", async () => {
    await sendFlowStep({
      ctx,
      data: {
        contact,
        step: postStep,
        commentAnchor: { commentId: "c-1", replyChannel: "private" },
      },
    } as never)

    expect(mockSendPrivateReplyMessage).toHaveBeenCalledTimes(1)
    expect(mockSendPrivateReplyMessage.mock.calls[0]?.[2]).toMatchObject({
      attachment: { type: "MEDIA_SHARE" },
    })
    expect(mockSendInstagramMessage).not.toHaveBeenCalled()
  })

  test("a composer message of kind channel_post converts to the same attachment", () => {
    expect([...convertMessage(postMessage())]).toEqual([
      {
        attachment: {
          type: "MEDIA_SHARE",
          payload: { id: "17900000000000001" },
        },
      },
    ])
  })

  test("a composer message sends the MEDIA_SHARE payload", async () => {
    await sendMessage({
      ctx,
      data: { contact, message: postMessage() },
    } as never)

    expect(mockSendInstagramMessage.mock.calls[0]?.[1]).toMatchObject({
      recipient: { id: "igsid-1" },
      message: {
        attachment: {
          type: "MEDIA_SHARE",
          payload: { id: "17900000000000001" },
        },
      },
    })
  })

  test("any other message still converts as before", () => {
    expect([...convertMessage(postMessage({ text: "hi" }, null))]).toEqual([
      { text: "hi" },
    ])
  })
})
