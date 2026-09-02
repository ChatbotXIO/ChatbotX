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

const { sendMessage } = await import("../src/handlers/message/outgoing-message")

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

describe("messenger sendMessage — multiple image attachments in one composed message", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendPageMessage.mockResolvedValue({
      recipient_id: "psid-1",
      message_id: "m_1",
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
            {
              fileType: "image",
              mimeType: "image/png",
              url: "https://example.com/c.png",
            },
          ],
        },
      },
    } as never)

    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendPageMessage.mock.calls[0]
    expect(payload.message.attachments).toEqual([
      {
        type: "image",
        payload: { url: "https://example.com/a.png", is_reusable: true },
      },
      {
        type: "image",
        payload: { url: "https://example.com/b.png", is_reusable: true },
      },
      {
        type: "image",
        payload: { url: "https://example.com/c.png", is_reusable: true },
      },
    ])
    expect(payload.message.attachment).toBeUndefined()
    expect(result).toEqual({ messageIds: ["m_1"] })
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

    const [, payload] = mockSendPageMessage.mock.calls[0]
    expect(payload.message.attachment).toEqual({
      type: "image",
      payload: { url: "https://example.com/a.png", is_reusable: true },
    })
    expect(payload.message.attachments).toBeUndefined()
  })

  test("a file attachment alongside multiple images still sends as its own message", async () => {
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
            {
              fileType: "image",
              mimeType: "image/png",
              url: "https://example.com/b.png",
            },
            {
              fileType: "file",
              mimeType: "application/pdf",
              url: "https://example.com/doc.pdf",
            },
          ],
        },
      },
    } as never)

    expect(mockSendPageMessage).toHaveBeenCalledTimes(2)
    const [, imageMessagePayload] = mockSendPageMessage.mock.calls[0]
    const [, filePayload] = mockSendPageMessage.mock.calls[1]
    expect(imageMessagePayload.message.attachments).toHaveLength(2)
    expect(filePayload.message.attachment).toEqual({
      type: "file",
      payload: { url: "https://example.com/doc.pdf", is_reusable: true },
    })
  })
})
