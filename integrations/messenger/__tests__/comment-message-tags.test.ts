import { describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"
import { hmacSha256Hex } from "../src/lib/webhook"
import { messengerFeedCommentValueSchema } from "../src/schema"

const PAGE_ID = "page-id"
const CLIENT_SECRET = "webhook-secret"

const buildCommentValue = (overrides: Record<string, unknown> = {}) => ({
  item: "comment",
  verb: "add",
  comment_id: "page-id_comment-id",
  post_id: "page-id_story-id",
  from: { id: "commenter-id", name: "Commenter" },
  message: "count me in",
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

describe("messengerFeedCommentValueSchema message_tags", () => {
  test("parses the tagged profiles a comment carries", () => {
    const parsed = messengerFeedCommentValueSchema.parse(
      buildCommentValue({
        message_tags: [
          { id: "tagged-a", name: "Alice", type: "user", offset: 0, length: 5 },
        ],
      }),
    )

    expect(parsed.message_tags).toEqual([
      { id: "tagged-a", name: "Alice", type: "user", offset: 0, length: 5 },
    ])
  })

  // Facebook omits the key entirely on an untagged comment — treating that as
  // a parse failure would drop every ordinary comment on the floor.
  test("accepts a comment with no tags at all", () => {
    expect(
      messengerFeedCommentValueSchema.parse(buildCommentValue()).message_tags,
    ).toBeUndefined()
  })
})

describe("feed webhook tag pass-through", () => {
  test("forwards the tagged ids to the incomingComment job", async () => {
    const add = await dispatch(
      buildCommentValue({
        message_tags: [
          { id: "tagged-a", name: "Alice" },
          { id: "tagged-b", name: "Bob" },
        ],
      }),
    )

    expect(add).toHaveBeenCalledWith(
      "incomingComment",
      expect.objectContaining({
        data: expect.objectContaining({
          commentData: expect.objectContaining({
            tags: [
              { id: "tagged-a", name: "Alice" },
              { id: "tagged-b", name: "Bob" },
            ],
          }),
        }),
      }),
    )
  })

  test("leaves tags undefined when the comment tagged nobody", async () => {
    const add = await dispatch(buildCommentValue())

    const [, job] = add.mock.calls[0]
    expect(job.data.commentData.tags).toBeUndefined()
  })
})
