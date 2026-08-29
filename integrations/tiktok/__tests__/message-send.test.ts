import { describe, expect, test, vi } from "vitest"

const post = vi.fn()
const postFormData = vi.fn()

vi.mock("../src/lib/http-client", () => ({
  createTiktokBusinessClient: () => ({ post, postFormData }),
}))

const { sendTiktokMessage, uploadTiktokMedia } = await import(
  "../src/apis/message"
)

describe("sendTiktokMessage", () => {
  test("throws when TikTok rejects the send with a non-zero code", async () => {
    post.mockResolvedValueOnce({
      code: 40_001,
      message: "Message content is invalid",
      data: null,
    })

    await expect(
      sendTiktokMessage("token", {
        business_id: "biz-1",
        recipient: { open_id: "open-1" },
        message_type: "TEXT",
        text: { content: "hi" },
      } as never),
    ).rejects.toThrow("Message content is invalid")
  })

  test("returns the message id when TikTok accepts the send", async () => {
    post.mockResolvedValueOnce({
      code: 0,
      data: { message: { message_id: "msg-1" } },
    })

    await expect(
      sendTiktokMessage("token", {
        business_id: "biz-1",
        recipient: { open_id: "open-1" },
        message_type: "TEXT",
        text: { content: "hi" },
      } as never),
    ).resolves.toBe("msg-1")
  })
})

describe("uploadTiktokMedia", () => {
  test("throws when TikTok rejects the upload with a non-zero code", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["image"])),
    }) as never
    postFormData.mockResolvedValueOnce({
      code: 40_002,
      message: "Unsupported media type",
      data: null,
    })

    await expect(
      uploadTiktokMedia("token", "biz-1", "https://example.com/image.png"),
    ).rejects.toThrow("Unsupported media type")
  })
})
