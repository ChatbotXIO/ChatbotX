import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockUploadAttachment } = vi.hoisted(() => ({
  mockUploadAttachment: vi.fn(),
}))

vi.mock("../src/api/message", () => ({
  uploadAttachment: mockUploadAttachment,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { convertFlowStepMultipleImages } = await import(
  "../src/handlers/message/outgoing-message/send-image"
)

describe("zalo convertFlowStepMultipleImages (fallback)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    let call = 0
    mockUploadAttachment.mockImplementation(() => {
      call += 1
      return Promise.resolve({
        data: { attachment_id: `att-${call}`, width: 100, height: 100 },
      })
    })
  })

  test("uploads and yields N sequential single-image template messages, one per url", async () => {
    const messages: unknown[] = []
    for await (const message of convertFlowStepMultipleImages({
      ctx: { auth: { tokens: { accessToken: "tok" } } },
      data: {
        step: {
          id: "step-1",
          stepType: "sendMultipleImages",
          images: [
            { id: "img-1", mode: "url", url: "https://example.com/a.png" },
            { id: "img-2", mode: "url", url: "https://example.com/b.png" },
          ],
        },
      },
    } as never)) {
      messages.push(message)
    }

    expect(mockUploadAttachment).toHaveBeenCalledTimes(2)
    expect(messages).toEqual([
      {
        attachment: {
          type: "template",
          payload: {
            template_type: "media",
            elements: [
              {
                media_type: "image",
                attachment_id: "att-1",
                width: 100,
                height: 100,
              },
            ],
          },
        },
      },
      {
        attachment: {
          type: "template",
          payload: {
            template_type: "media",
            elements: [
              {
                media_type: "image",
                attachment_id: "att-2",
                width: 100,
                height: 100,
              },
            ],
          },
        },
      },
    ])
  })
})
