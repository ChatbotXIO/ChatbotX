import { describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"
import { hmacSha256Hex } from "../src/lib/webhook"

const CLIENT_SECRET = "webhook-secret"

/**
 * Instagram's comment webhook carries no tagged-user list — mentions arrive as
 * bare `@handle` text — so the commenter's own handle is the only thing that
 * can ever make one resolvable to a contact. Dropping it here silently caps
 * `{{total_new_tagged}}` accuracy forever.
 */
const dispatch = async (from: Record<string, unknown>) => {
  const body = JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: "17841403141794402",
        time: 1_789_211_339,
        changes: [
          {
            field: "comments",
            value: {
              from,
              media: { id: "17981236959118569", media_product_type: "FEED" },
              id: "18164877721464645",
              text: "pc3 @taunguyen171995",
            },
          },
        ],
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

describe("Instagram via Facebook comment username pass-through", () => {
  test("forwards the commenter handle to the incomingComment job", async () => {
    const add = await dispatch({
      id: "1565915648582103",
      username: "thienphuc55772026",
    })

    expect(add).toHaveBeenCalledWith(
      "incomingComment",
      expect.objectContaining({
        data: expect.objectContaining({
          commentData: expect.objectContaining({
            fromUsername: "thienphuc55772026",
          }),
        }),
      }),
    )
  })

  // `fromName` already falls back to the id so the inbox has something to
  // show; `fromUsername` must NOT, or a numeric id would be written to
  // `sourceUsername` and could collide with a real handle lookup.
  test("leaves the handle undefined when the payload has none", async () => {
    const add = await dispatch({ id: "1565915648582103" })

    const [, job] = add.mock.calls[0]
    expect(job.data.commentData.fromUsername).toBeUndefined()
    expect(job.data.commentData.fromName).toBe("1565915648582103")
  })
})
