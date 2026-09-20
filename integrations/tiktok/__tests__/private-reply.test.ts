import { describe, expect, test, vi } from "vitest"

const post = vi.fn()
vi.mock("../src/lib/http-client", () => ({
  createTiktokBusinessClient: () => ({ post }),
}))

const { sendTiktokCommentPrivateReply } = await import("../src/apis/message")
const { sendPrivateReply } = await import(
  "../src/handlers/comment/outgoing-private-reply"
)

const COMMENT_ID = "7247303576418566913"
const BUSINESS_ID = "business-1"

const TEXT_LIMIT_MESSAGE = /6000 characters/
const MISSING_COMMENT_ID_MESSAGE = /replyToCommentId is missing/
const ATTACHMENTS_MESSAGE = /cannot carry attachments/

const ctx = {
  auth: {
    tokens: { accessToken: "token" },
    metadata: { openId: BUSINESS_ID },
  },
} as never

describe("sendTiktokCommentPrivateReply", () => {
  test("addresses the DM by comment id and omits recipient fields entirely", async () => {
    post.mockResolvedValueOnce({
      code: 0,
      data: { message: { message_id: "msg-1" } },
    })

    await sendTiktokCommentPrivateReply("token", {
      businessId: BUSINESS_ID,
      commentId: COMMENT_ID,
      text: "hi",
    })

    const [, options] = post.mock.calls[0]
    expect(options.json).toEqual({
      business_id: BUSINESS_ID,
      direct_reply: {
        reply_type: "COMMENT_REPLY",
        comment_reply: { comment_id: COMMENT_ID },
      },
      message_type: "TEXT",
      text: { body: "hi" },
    })
    // TikTok rejects a request carrying both; their absence is the contract,
    // not an omission.
    expect(options.json).not.toHaveProperty("recipient")
    expect(options.json).not.toHaveProperty("recipient_type")
  })

  test("returns the message id TikTok accepted", async () => {
    post.mockResolvedValueOnce({
      code: 0,
      data: { message: { message_id: "msg-2" } },
    })

    await expect(
      sendTiktokCommentPrivateReply("token", {
        businessId: BUSINESS_ID,
        commentId: COMMENT_ID,
        text: "hi",
      }),
    ).resolves.toBe("msg-2")
  })

  // The eligibility rules (18+, no DM in the past 24h, already answered, outside
  // VN/ID/TH…) are only ever reported in TikTok's own wording, so flattening it
  // would leave a workspace with no way to tell which rule it hit.
  test("surfaces TikTok's rejection message verbatim", async () => {
    post.mockResolvedValueOnce({
      code: 40_001,
      message: "The comment has already been replied to via direct message",
      data: null,
    })

    await expect(
      sendTiktokCommentPrivateReply("token", {
        businessId: BUSINESS_ID,
        commentId: COMMENT_ID,
        text: "hi",
      }),
    ).rejects.toThrow(
      "The comment has already been replied to via direct message",
    )
  })

  test("refuses text over the 6000-character limit without calling the API", async () => {
    await expect(
      sendTiktokCommentPrivateReply("token", {
        businessId: BUSINESS_ID,
        commentId: COMMENT_ID,
        text: "a".repeat(6001),
      }),
    ).rejects.toThrow(TEXT_LIMIT_MESSAGE)
    expect(post).not.toHaveBeenCalled()
  })
})

describe("sendPrivateReply handler", () => {
  const send = (message: unknown) =>
    sendPrivateReply({ ctx, data: { message } } as never)

  test("sends the comment-anchored DM and returns the message id", async () => {
    post.mockResolvedValueOnce({
      code: 0,
      data: { message: { message_id: "msg-3" } },
    })

    await expect(
      send({
        text: "thanks!",
        contentAttributes: { replyToCommentId: COMMENT_ID },
      }),
    ).resolves.toEqual({ messageIds: ["msg-3"] })
  })

  test("refuses when the outgoing message is not linked to a comment", async () => {
    await expect(
      send({ text: "thanks!", contentAttributes: {} }),
    ).rejects.toThrow(MISSING_COMMENT_ID_MESSAGE)
  })

  // Reporting the reply as delivered while dropping its media is the worse
  // failure, so an attachment is refused rather than stripped.
  test("refuses attachments rather than dropping them", async () => {
    await expect(
      send({
        text: "thanks!",
        attachments: [{ url: "https://example.com/a.png" }],
        contentAttributes: { replyToCommentId: COMMENT_ID },
      }),
    ).rejects.toThrow(ATTACHMENTS_MESSAGE)
  })

  test("skips the API call when there is no text to send", async () => {
    await expect(
      send({
        text: "   ",
        contentAttributes: { replyToCommentId: COMMENT_ID },
      }),
    ).resolves.toEqual({ messageIds: [] })
    expect(post).not.toHaveBeenCalled()
  })
})
