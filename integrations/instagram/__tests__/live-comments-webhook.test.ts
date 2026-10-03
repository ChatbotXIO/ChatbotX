import { describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"
import { hmacSha256Hex } from "../src/lib/webhook"

const CLIENT_SECRET = "webhook-secret"

const commentValue = (id: string) => ({
  from: { id: "2073295670063800", username: "viewer" },
  media: { id: "18055975949799859", media_product_type: "LIVE" },
  id,
  text: "price?",
})

/**
 * Instagram delivers comments on a live broadcast on their own `live_comments`
 * field. Unhandled, every Instagram Live automation receives nothing; handled
 * without the flag, the comment is answered by the post automations instead.
 */
const dispatch = async (changes: { field: string; value: unknown }[]) => {
  const body = JSON.stringify({
    object: "instagram",
    entry: [{ id: "17841477862382135", time: 1_789_211_339, changes }],
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

const commentDataOf = (add: ReturnType<typeof vi.fn>, call: number) =>
  add.mock.calls[call]?.[1].data.commentData

describe("live_comments webhook", () => {
  test("enqueues a live comment flagged isLive", async () => {
    const add = await dispatch([
      { field: "live_comments", value: commentValue("c-live") },
    ])

    expect(add).toHaveBeenCalledTimes(1)
    expect(commentDataOf(add, 0)).toEqual(
      expect.objectContaining({ commentId: "c-live", isLive: true }),
    )
  })

  test("a post comment carries no isLive flag", async () => {
    const add = await dispatch([
      { field: "comments", value: commentValue("c-post") },
    ])

    expect(commentDataOf(add, 0).isLive).toBeUndefined()
  })

  test("every comment change in a batched entry is enqueued", async () => {
    const add = await dispatch([
      { field: "live_comments", value: commentValue("c-1") },
      { field: "live_comments", value: commentValue("c-2") },
    ])

    expect(add).toHaveBeenCalledTimes(2)
    expect(commentDataOf(add, 1).commentId).toBe("c-2")
  })
})
