import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendInstagramMessage, mockSendPrivateReplyMessage } = vi.hoisted(
  () => ({
    mockSendInstagramMessage: vi.fn(),
    mockSendPrivateReplyMessage: vi.fn(),
  }),
)

vi.mock("../src/apis/page", () => ({
  sendInstagramMessage: mockSendInstagramMessage,
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
    metadata: { igId: "ig-1", version: "v23.0" },
  },
} as never

const contact = { id: "contact-1", sourceId: "igsid-1" } as never

const textStep = {
  id: "step-1",
  nodeId: "node-1",
  stepType: "sendText",
  text: "private reply via flow",
  buttons: [],
}

describe("instagram-facebook sendFlowStep — comment-anchored private reply", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendInstagramMessage.mockResolvedValue({
      recipient_id: "igsid-1",
      message_id: "m_normal-1",
    })
    mockSendPrivateReplyMessage.mockResolvedValue({
      recipient_id: "igsid-1",
      message_id: "m_anchored-1",
    })
  })

  test("uses the comment_id-anchored Send API when commentAnchor is present", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        commentAnchor: { commentId: "comment-1", replyChannel: "private" },
        step: textStep,
      },
    } as never)

    expect(mockSendPrivateReplyMessage).toHaveBeenCalledTimes(1)
    expect(mockSendPrivateReplyMessage).toHaveBeenCalledWith(
      ctx.auth,
      "comment-1",
      expect.objectContaining({ text: "private reply via flow" }),
    )
    expect(mockSendInstagramMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: ["m_anchored-1"] })
  })

  test("uses the normal Send API when commentAnchor.replyChannel is public (defense-in-depth: public replies are never routed here)", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        commentAnchor: { commentId: "comment-1", replyChannel: "public" },
        step: textStep,
      },
    } as never)

    expect(mockSendInstagramMessage).toHaveBeenCalledTimes(1)
    expect(mockSendPrivateReplyMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: ["m_normal-1"] })
  })

  test("uses the normal Send API when commentAnchor is absent (regression guard)", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        step: textStep,
      },
    } as never)

    expect(mockSendInstagramMessage).toHaveBeenCalledTimes(1)
    expect(mockSendPrivateReplyMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: ["m_normal-1"] })
  })

  test("only the first Instagram message of a multi-message step uses the comment anchor", async () => {
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

    // 11 cards chunked by 10 → 2 Instagram messages for this single step
    expect(mockSendPrivateReplyMessage).toHaveBeenCalledTimes(1)
    expect(mockSendPrivateReplyMessage).toHaveBeenCalledWith(
      ctx.auth,
      "comment-1",
      expect.anything(),
    )
    expect(mockSendInstagramMessage).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ messageIds: ["m_anchored-1", "m_normal-1"] })
  })
})
