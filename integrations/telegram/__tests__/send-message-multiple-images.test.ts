import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendTelegramMediaGroup, mockSendTelegramPhoto } = vi.hoisted(
  () => ({
    mockSendTelegramMediaGroup: vi.fn(),
    mockSendTelegramPhoto: vi.fn(),
  }),
)

vi.mock("../src/apis/bot", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/apis/bot")>()),
  sendTelegramMediaGroup: mockSendTelegramMediaGroup,
  sendTelegramPhoto: mockSendTelegramPhoto,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendMessage } = await import("../src/handlers/message/outgoing-message")

const ctx = { auth: { secretText: "tok" } } as never
const contact = { sourceId: "chat-1" } as never

describe("telegram sendMessage — multiple image attachments in one composed message", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendTelegramMediaGroup.mockResolvedValue([101, 102, 103])
    mockSendTelegramPhoto.mockResolvedValue(200)
  })

  test("batches multiple image attachments into a single sendMediaGroup call", async () => {
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

    expect(mockSendTelegramMediaGroup).toHaveBeenCalledTimes(1)
    expect(mockSendTelegramPhoto).not.toHaveBeenCalled()
    const [, payload] = mockSendTelegramMediaGroup.mock.calls[0]
    expect(payload).toEqual({
      chat_id: "chat-1",
      media: [
        { type: "photo", media: "https://example.com/a.png" },
        { type: "photo", media: "https://example.com/b.png" },
        { type: "photo", media: "https://example.com/c.png" },
      ],
    })
    expect(result).toEqual({ messageIds: ["101", "102", "103"] })
  })

  test("a single image still uses sendPhoto, not sendMediaGroup", async () => {
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
          ],
        },
      },
    } as never)

    expect(mockSendTelegramMediaGroup).not.toHaveBeenCalled()
    expect(mockSendTelegramPhoto).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ messageIds: ["200"] })
  })
})
