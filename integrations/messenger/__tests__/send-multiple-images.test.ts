import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendPageMessage } = vi.hoisted(() => ({
  mockSendPageMessage: vi.fn(),
}))

vi.mock("../src/apis/message", () => ({
  sendPageMessage: mockSendPageMessage,
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

describe("messenger sendFlowStep — sendMultipleImages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendPageMessage.mockResolvedValue({
      recipient_id: "psid-1",
      message_id: "m_1",
    })
  })

  test("sends exactly one combined message with all images in one attachments[] array", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        step: {
          id: "step-1",
          nodeId: "node-1",
          stepType: "sendMultipleImages",
          images: [
            { id: "img-1", mode: "url", url: "https://example.com/a.png" },
            { id: "img-2", mode: "url", url: "https://example.com/b.png" },
            { id: "img-3", mode: "url", url: "https://example.com/c.png" },
          ],
        },
      },
    } as never)

    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendPageMessage.mock.calls[0]
    expect(payload.message.attachments).toEqual([
      { type: "image", payload: { url: "https://example.com/a.png" } },
      { type: "image", payload: { url: "https://example.com/b.png" } },
      { type: "image", payload: { url: "https://example.com/c.png" } },
    ])
    expect(payload.message.attachment).toBeUndefined()
    expect(payload.message.quick_replies).toBeUndefined()
    expect(result).toEqual({ messageIds: ["m_1"] })
  })

  test("forwards quick replies onto the combined message when the node has any", async () => {
    await sendFlowStep({
      ctx,
      data: {
        contact,
        quickReplies: [
          {
            id: "btn-1",
            label: "Yes",
            buttonType: "postback",
            postback: "yes",
          },
          { id: "btn-2", label: "No", buttonType: "postback", postback: "no" },
        ],
        step: {
          id: "step-1",
          nodeId: "node-1",
          stepType: "sendMultipleImages",
          images: [
            { id: "img-1", mode: "url", url: "https://example.com/a.png" },
            { id: "img-2", mode: "url", url: "https://example.com/b.png" },
          ],
        },
      },
    } as never)

    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendPageMessage.mock.calls[0]
    expect(payload.message.quick_replies).toEqual([
      { content_type: "text", title: "Yes", payload: "yes" },
      { content_type: "text", title: "No", payload: "no" },
    ])
  })
})
