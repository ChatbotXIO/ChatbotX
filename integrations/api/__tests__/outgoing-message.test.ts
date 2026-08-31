import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockPostSignedEnvelope } = vi.hoisted(() => ({
  mockPostSignedEnvelope: vi.fn(),
}))

vi.mock("../src/lib/delivery", () => ({
  postSignedEnvelope: mockPostSignedEnvelope,
}))

const { sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)

const ctx = {
  auth: {
    callbackUrl: "https://example.com/callback",
    signingSecret: "secret",
  },
} as never

const contact = { id: "contact-1", sourceId: "source-1" } as never

describe("api sendFlowStep — sendMultipleImages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPostSignedEnvelope.mockResolvedValue({ messageId: "m_1" })
  })

  test("maps every image into contentAttributes.attachments instead of degrading to text", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        quickReplies: [],
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

    expect(mockPostSignedEnvelope).toHaveBeenCalledTimes(1)
    const [{ envelope }] = mockPostSignedEnvelope.mock.calls[0]
    expect(envelope.message.text).toBeNull()
    expect(envelope.message.contentAttributes).toEqual({
      attachments: [
        { url: "https://example.com/a.png", fileType: "image" },
        { url: "https://example.com/b.png", fileType: "image" },
        { url: "https://example.com/c.png", fileType: "image" },
      ],
    })
    expect(result).toEqual({ messageIds: ["m_1"] })
  })
})
