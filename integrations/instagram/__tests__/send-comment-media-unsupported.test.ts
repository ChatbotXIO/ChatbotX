import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendComment } = vi.hoisted(() => ({
  mockSendComment: vi.fn(),
}))

vi.mock("../src/apis/comment", () => ({
  sendComment: mockSendComment,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendComment } = await import("../src/handlers/comment/outgoing-comment")
const { logger } = await import("../src/lib/logger")

const ctx = {
  auth: {
    tokens: { accessToken: "tok" },
    metadata: { igId: "ig-1", version: "v23.0" },
  },
} as never

const buildProps = (message: Record<string, unknown>) =>
  ({
    ctx,
    data: {
      contact: { id: "contact-1", sourceId: "igsid-1" },
      message: {
        id: "msg-1",
        contentAttributes: { replyToCommentId: "comment-1" },
        ...message,
      },
    },
  }) as never

describe("instagram sendComment — media is unsupported", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendComment.mockResolvedValue({ id: "reply-1" })
  })

  // `POST /{ig-comment-id}/replies` accepts only `message` — there is no
  // `attachment_url` (that is Facebook-Page-only). Swallowing this made a media
  // step of a public comment-reply flow disappear with nothing but a warn.
  test("throws a permanent ChannelError when the message carries an attachment, without calling the API", async () => {
    const promise = sendComment(
      buildProps({
        text: null,
        attachments: [
          { url: "https://example.com/img.jpg", fileType: "image" },
        ],
      }),
    )

    await expect(promise).rejects.toBeInstanceOf(ChannelError)
    await expect(promise).rejects.toMatchObject({
      category: ChannelErrorCategory.PAYLOAD_INVALID,
      isRetryable: false,
      isPermanent: true,
    })
    expect(mockSendComment).not.toHaveBeenCalled()
  })

  test("throws even when the attachment rides along with text, rather than posting a reply missing its media", async () => {
    await expect(
      sendComment(
        buildProps({
          text: "look at this",
          attachments: [
            { url: "https://example.com/img.jpg", fileType: "image" },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(ChannelError)

    expect(mockSendComment).not.toHaveBeenCalled()
  })

  test("posts a text-only reply as before", async () => {
    const result = await sendComment(buildProps({ text: "hello" }))

    expect(mockSendComment).toHaveBeenCalledWith(ctx.auth, "comment-1", "hello")
    expect(result).toEqual({ messageIds: ["reply-1"] })
  })

  test("still skips silently when there is nothing at all to send", async () => {
    const result = await sendComment(buildProps({ text: null }))

    expect(mockSendComment).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledOnce()
    expect(result).toEqual({ messageIds: [] })
  })
})
