import { describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"
import { hmacSha256Hex } from "../src/lib/webhook"

const CLIENT_SECRET = "webhook-secret"

const base = {
  from: { id: "2073295670063800", username: "viewer" },
  media: { id: "18055975949799859", media_product_type: "FEED" },
  text: "price?",
}

const dispatch = async (field: string, value: Record<string, unknown>) => {
  const body = JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: "17841477862382135",
        time: 1_789_211_339,
        changes: [{ field, value }],
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

const commentDataOf = (add: ReturnType<typeof vi.fn>) =>
  add.mock.calls[0]?.[1].data.commentData

describe("comment webhook id shapes (Facebook/Unified Login)", () => {
  test("comment_id yields the same event as id", async () => {
    const legacy = await dispatch("comments", { ...base, id: "c-1" })
    const unified = await dispatch("comments", { ...base, comment_id: "c-1" })

    expect(unified).toHaveBeenCalledTimes(1)
    expect(commentDataOf(unified)).toEqual(commentDataOf(legacy))
    expect(commentDataOf(unified).commentId).toBe("c-1")
  })

  test("live_comments accepts comment_id", async () => {
    const add = await dispatch("live_comments", { ...base, comment_id: "c-2" })

    expect(commentDataOf(add)).toEqual(
      expect.objectContaining({ commentId: "c-2", isLive: true }),
    )
  })

  test("reply keeps parent_id with comment_id", async () => {
    const add = await dispatch("comments", {
      ...base,
      comment_id: "c-3",
      parent_id: "c-parent",
    })

    expect(commentDataOf(add)).toEqual(
      expect.objectContaining({ commentId: "c-3", parentId: "c-parent" }),
    )
  })

  test("payload with neither id nor comment_id is still dropped", async () => {
    const add = await dispatch("comments", { ...base })

    expect(add).not.toHaveBeenCalled()
  })
})
