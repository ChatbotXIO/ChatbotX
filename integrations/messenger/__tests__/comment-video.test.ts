import { describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"
import { hmacSha256Hex } from "../src/lib/webhook"

const PAGE_ID = "page-id"
const CLIENT_SECRET = "webhook-secret"
const VIDEO_URL = "https://video.xx.fbcdn.net/v/t42.3356-2/comment-video.mp4"

const buildCommentValue = (overrides: Record<string, unknown> = {}) => ({
  item: "comment",
  verb: "add",
  comment_id: "story-id_comment-id",
  post_id: "page-id_story-id",
  from: { id: "commenter-id", name: "Commenter" },
  created_time: 1_783_674_105,
  ...overrides,
})

const dispatch = async (value: Record<string, unknown>) => {
  const body = JSON.stringify({
    object: "page",
    entry: [
      {
        id: PAGE_ID,
        time: 1_783_674_105,
        changes: [{ field: "feed", value }],
      },
    ],
  })
  const signature = await hmacSha256Hex(CLIENT_SECRET, body)
  const add = vi.fn()

  await webhookHandler({
    config: { clientSecret: CLIENT_SECRET },
    req: new Request("https://example.test/webhook", {
      method: "POST",
      body,
      headers: { "x-hub-signature-256": `sha256=${signature}` },
    }),
    queue: { add },
  } as never)

  return add
}

describe("feed webhook video pass-through", () => {
  test("forwards a video-only comment's video URL to the incomingComment job", async () => {
    const add = await dispatch(buildCommentValue({ video: VIDEO_URL }))

    const [action, job] = add.mock.calls[0]
    expect(action).toBe("incomingComment")
    expect(job.data.commentData.videoUrl).toBe(VIDEO_URL)
    expect(job.data.commentData.message).toBeUndefined()
  })

  test("leaves videoUrl undefined on a comment without a video", async () => {
    const add = await dispatch(buildCommentValue({ message: "hello" }))

    const [, job] = add.mock.calls[0]
    expect(job.data.commentData.videoUrl).toBeUndefined()
  })
})
