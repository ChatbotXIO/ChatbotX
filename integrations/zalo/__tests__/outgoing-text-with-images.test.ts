import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendMessageToZaloOA, mockUploadAttachment } = vi.hoisted(() => ({
  mockSendMessageToZaloOA: vi.fn(),
  mockUploadAttachment: vi.fn(),
}))

vi.mock("../src/api/message", () => ({
  sendMessageToZaloOA: mockSendMessageToZaloOA,
  uploadAttachment: mockUploadAttachment,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendMessage } = await import("../src/handlers/message/outgoing-message")

const ctx = { auth: { tokens: { accessToken: "tok" } } } as never
const contact = { id: "contact-1", sourceId: "zalo-uid-1" } as never

const image = (url: string) => ({
  fileType: "image",
  mimeType: "image/png",
  originPath: url,
  size: 10,
  url,
})

describe("zalo sendMessage with text and images", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendMessageToZaloOA.mockResolvedValue({
      error: 0,
      data: { message_id: "m-1" },
    })
    mockUploadAttachment.mockResolvedValue({
      data: { attachment_id: "att-1" },
    })
  })

  test("sends the text first, then each image as its own message", async () => {
    const result = await sendMessage({
      ctx,
      data: {
        contact,
        message: {
          id: "msg-1",
          contentType: "text",
          messageType: "outgoing",
          text: "hello",
          attachments: [image("https://cdn/a.png"), image("https://cdn/b.png")],
        },
      },
    } as never)

    expect(mockSendMessageToZaloOA).toHaveBeenCalledTimes(3)
    expect(mockSendMessageToZaloOA.mock.calls[0]?.[1]).toMatchObject({
      message: { text: "hello" },
    })
    expect(mockSendMessageToZaloOA.mock.calls[1]?.[1]).toMatchObject({
      message: { attachment: { type: "template" } },
    })
    expect(result).toMatchObject({ sentCount: 3 })
  })

  test("sends nothing when an image upload fails, so a retry can't repeat the text", async () => {
    mockUploadAttachment
      .mockResolvedValueOnce({ data: { attachment_id: "att-1" } })
      .mockRejectedValueOnce(new Error("upload failed"))

    await expect(
      sendMessage({
        ctx,
        data: {
          contact,
          message: {
            id: "msg-1",
            contentType: "text",
            messageType: "outgoing",
            text: "hello",
            attachments: [
              image("https://cdn/a.png"),
              image("https://cdn/b.png"),
            ],
          },
        },
      } as never),
    ).rejects.toBeDefined()

    expect(mockSendMessageToZaloOA).not.toHaveBeenCalled()
  })

  test("still sends images when there is no text", async () => {
    await sendMessage({
      ctx,
      data: {
        contact,
        message: {
          id: "msg-1",
          contentType: "text",
          messageType: "outgoing",
          attachments: [image("https://cdn/a.png")],
        },
      },
    } as never)

    expect(mockSendMessageToZaloOA).toHaveBeenCalledTimes(1)
  })
})
