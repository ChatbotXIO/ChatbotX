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

const { sendMessage } = await import("../src/handlers/message/outgoing-message")

const ctx = { auth: { tokens: { accessToken: "tok" } } } as never
const contact = { id: "contact-1", sourceId: "igsid-1" } as never

describe("instagram sendMessage — multiple image attachments in one composed message", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendInstagramMessage.mockResolvedValue({
      recipient_id: "igsid-1",
      message_id: "ig_provider-1",
    })
  })

  test("batches multiple image attachments into a single Send API call", async () => {
    const result = await sendMessage({
      ctx,
      data: {
        contact,
        message: {
          id: "msg-1",
          contentType: "text",
          text: null,
          attachments: [
            {
              fileType: "image",
              mimeType: "image/png",
              url: "https://example.com/a.png",
            },
            {
              fileType: "image",
              mimeType: "image/png",
              url: "https://example.com/b.png",
            },
          ],
        },
      },
    } as never)

    expect(mockSendInstagramMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendInstagramMessage.mock.calls[0]
    expect(payload.message.attachments).toEqual([
      {
        type: "image",
        payload: { url: "https://example.com/a.png", is_reusable: true },
      },
      {
        type: "image",
        payload: { url: "https://example.com/b.png", is_reusable: true },
      },
    ])
    expect(payload.message.attachment).toBeUndefined()
    expect(result).toEqual({ messageIds: ["ig_provider-1"] })
  })

  test("a single image still uses the singular attachment form", async () => {
    await sendMessage({
      ctx,
      data: {
        contact,
        message: {
          id: "msg-1",
          contentType: "text",
          text: null,
          attachments: [
            {
              fileType: "image",
              mimeType: "image/png",
              url: "https://example.com/a.png",
            },
          ],
        },
      },
    } as never)

    const [, payload] = mockSendInstagramMessage.mock.calls[0]
    expect(payload.message.attachment).toEqual({
      type: "image",
      payload: { url: "https://example.com/a.png", is_reusable: true },
    })
  })
})
