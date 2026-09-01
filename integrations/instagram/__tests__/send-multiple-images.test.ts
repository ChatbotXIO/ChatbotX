import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendInstagramMessage } = vi.hoisted(() => ({
  mockSendInstagramMessage: vi.fn(),
}))

vi.mock("../src/apis/page", () => ({
  sendInstagramMessage: mockSendInstagramMessage,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)

const ctx = { auth: { tokens: { accessToken: "tok" } } } as never
const contact = { id: "contact-1", sourceId: "igsid-1" } as never

describe("instagram sendFlowStep — sendMultipleImages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendInstagramMessage.mockResolvedValue({
      recipient_id: "igsid-1",
      message_id: "ig_provider-1",
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
          ],
        },
      },
    } as never)

    expect(mockSendInstagramMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendInstagramMessage.mock.calls[0]
    expect(payload.message.attachments).toEqual([
      { type: "image", payload: { url: "https://example.com/a.png" } },
      { type: "image", payload: { url: "https://example.com/b.png" } },
    ])
    expect(result).toEqual({ messageIds: ["ig_provider-1"] })
  })
})
