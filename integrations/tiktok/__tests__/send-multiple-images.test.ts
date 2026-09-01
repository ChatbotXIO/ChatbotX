import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendTiktokMessage, mockUploadTiktokMedia } = vi.hoisted(() => ({
  mockSendTiktokMessage: vi.fn(),
  mockUploadTiktokMedia: vi.fn(),
}))

vi.mock("../src/apis/message", () => ({
  sendTiktokMessage: mockSendTiktokMessage,
  uploadTiktokMedia: mockUploadTiktokMedia,
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
    metadata: { openId: "biz-1" },
  },
} as never

const contact = { sourceConversationId: "conv-1" } as never

describe("tiktok sendFlowStep — sendMultipleImages (fallback)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    let call = 0
    mockUploadTiktokMedia.mockImplementation(() => {
      call += 1
      return Promise.resolve(`media-${call}`)
    })
    mockSendTiktokMessage.mockImplementation((_token, payload) =>
      Promise.resolve(`msg-${payload.image.media_id}`),
    )
  })

  test("uploads and sends N sequential single-image messages, one per url", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        step: {
          id: "step-1",
          stepType: "sendMultipleImages",
          images: [
            { id: "img-1", mode: "url", url: "https://example.com/a.png" },
            { id: "img-2", mode: "url", url: "https://example.com/b.png" },
          ],
        },
      },
    } as never)

    expect(mockUploadTiktokMedia).toHaveBeenCalledTimes(2)
    expect(mockUploadTiktokMedia).toHaveBeenNthCalledWith(
      1,
      "tok",
      "biz-1",
      "https://example.com/a.png",
    )
    expect(mockUploadTiktokMedia).toHaveBeenNthCalledWith(
      2,
      "tok",
      "biz-1",
      "https://example.com/b.png",
    )
    expect(mockSendTiktokMessage).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ messageIds: ["msg-media-1", "msg-media-2"] })
  })
})
