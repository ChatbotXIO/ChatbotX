import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendPageMessage, mockSendPrivateReplyMessage } = vi.hoisted(() => ({
  mockSendPageMessage: vi.fn(),
  mockSendPrivateReplyMessage: vi.fn(),
}))

vi.mock("../src/apis/message", () => ({
  sendPageMessage: mockSendPageMessage,
}))

vi.mock("../src/apis/comment", () => ({
  sendPrivateReplyMessage: mockSendPrivateReplyMessage,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)

const ctx = {
  auth: {
    tokens: { accessToken: "tok" },
    version: "v20.0",
    metadata: { pageId: "page-1" },
  },
  integrationDetail: { personaId: undefined },
} as never

const contact = {
  id: "contact-1",
  sourceId: "psid-1",
  lastIncomingMessageAt: new Date("2026-06-23T09:00:00.000Z"),
} as never

describe("messenger sendFlowStep — comment-anchored private reply", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendPageMessage.mockResolvedValue({
      recipient_id: "psid-1",
      message_id: "m_normal-1",
    })
    mockSendPrivateReplyMessage.mockResolvedValue({
      recipient_id: "psid-1",
      message_id: "m_anchored-1",
    })
  })

  test("uses the comment_id-anchored Send API when commentAnchor is present", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        commentAnchor: { commentId: "comment-1", replyChannel: "private" },
        step: {
          id: "step-1",
          nodeId: "node-1",
          stepType: "sendText",
          text: "private reply via flow",
          buttons: [],
        },
      },
    } as never)

    expect(mockSendPrivateReplyMessage).toHaveBeenCalledTimes(1)
    expect(mockSendPrivateReplyMessage).toHaveBeenCalledWith(
      ctx.auth,
      "comment-1",
      expect.objectContaining({ text: "private reply via flow" }),
      undefined,
    )
    expect(mockSendPageMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: ["m_anchored-1"] })
  })

  test("uses the normal Send API when commentAnchor.replyChannel is public (defense-in-depth: public replies are never routed here)", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        commentAnchor: { commentId: "comment-1", replyChannel: "public" },
        step: {
          id: "step-1",
          nodeId: "node-1",
          stepType: "sendText",
          text: "public reply via flow",
          buttons: [],
        },
      },
    } as never)

    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    expect(mockSendPrivateReplyMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: ["m_normal-1"] })
  })

  test("uses the normal Send API when commentAnchor is absent (regression guard)", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        step: {
          id: "step-1",
          nodeId: "node-1",
          stepType: "sendText",
          text: "normal flow reply",
          buttons: [],
        },
      },
    } as never)

    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    expect(mockSendPrivateReplyMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: ["m_normal-1"] })
  })

  test("only the first Facebook message of a multi-message step uses the comment anchor", async () => {
    const cards = Array.from({ length: 11 }, (_, i) => ({
      title: `Card ${i}`,
      buttons: [],
    }))

    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        commentAnchor: { commentId: "comment-1", replyChannel: "private" },
        step: {
          id: "step-1",
          nodeId: "node-1",
          stepType: "sendCarousel",
          cards,
        },
      },
    } as never)

    // 11 cards chunked by 10 → 2 Facebook messages for this single step
    expect(mockSendPrivateReplyMessage).toHaveBeenCalledTimes(1)
    expect(mockSendPrivateReplyMessage).toHaveBeenCalledWith(
      ctx.auth,
      "comment-1",
      expect.anything(),
      undefined,
    )
    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ messageIds: ["m_anchored-1", "m_normal-1"] })
  })
})
