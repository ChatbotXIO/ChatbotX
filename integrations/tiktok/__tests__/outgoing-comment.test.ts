import { describe, expect, test, vi } from "vitest"

const replyToTiktokComment = vi.fn()
vi.mock("../src/apis/comment", () => ({ replyToTiktokComment }))

const { sendComment } = await import("../src/handlers/comment/outgoing-comment")

const VIDEO_ID = "7203946942097902849"
const COMMENT_ID = "7247303576418566913"
const MISSING_VIDEO_ID_MESSAGE = /without the video id/

const ctx = {
  auth: {
    tokens: { accessToken: "token" },
    metadata: { openId: "business-1" },
  },
} as never

const send = (props: {
  postIdOnMessage?: string
  sourceConversationId?: string | null
}) =>
  sendComment({
    ctx,
    data: {
      contact: { sourceConversationId: props.sourceConversationId ?? null },
      message: {
        text: "thanks!",
        contentAttributes: {
          replyToCommentId: COMMENT_ID,
          ...(props.postIdOnMessage ? { postId: props.postIdOnMessage } : {}),
        },
      },
    },
  })

describe("sendComment video id resolution", () => {
  test("uses the post id stamped on the comment message", async () => {
    replyToTiktokComment.mockResolvedValue({ comment_id: "reply-1" })

    await send({ postIdOnMessage: VIDEO_ID, sourceConversationId: null })

    expect(replyToTiktokComment).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({ videoId: VIDEO_ID, commentId: COMMENT_ID }),
    )
  })

  // The regression: the conversation's `sourceId` doubles as TikTok's DM slot
  // and normalization can leave a comment conversation without one, which used
  // to fail every reply with "without the video id" even though the comment
  // message itself carried it all along.
  test("does not depend on the conversation carrying the post id", async () => {
    replyToTiktokComment.mockResolvedValue({ comment_id: "reply-1" })

    await expect(
      send({ postIdOnMessage: VIDEO_ID, sourceConversationId: null }),
    ).resolves.toBeDefined()
  })

  // Anything enqueued before the post id was threaded through still has to go
  // out, so the conversation stays a fallback rather than being dropped.
  test("falls back to the conversation when the message has no post id", async () => {
    replyToTiktokComment.mockResolvedValue({ comment_id: "reply-1" })

    await send({ sourceConversationId: VIDEO_ID })

    expect(replyToTiktokComment).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({ videoId: VIDEO_ID }),
    )
  })

  test("still refuses when neither source has a post id", async () => {
    await expect(send({ sourceConversationId: null })).rejects.toThrow(
      MISSING_VIDEO_ID_MESSAGE,
    )
  })
})
