import { describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"
import { hmacSha256Hex } from "../src/lib/webhook"

const CLIENT_SECRET = "webhook-secret"

async function signedRequest(body: string) {
  const signature = await hmacSha256Hex(CLIENT_SECRET, body)
  return new Request("https://example.test/webhook", {
    method: "POST",
    body,
    headers: { "x-hub-signature-256": `sha256=${signature}` },
  })
}

describe("instagram-facebook webhook integrationType routing", () => {
  test("incomingComment is enqueued with integrationType instagramFacebook", async () => {
    const body = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "ig-account-id",
          time: 1_783_674_105,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment-id",
                text: "keyword",
                from: { id: "author-id" },
                media: { id: "media-id", media_product_type: "FEED" },
              },
            },
          ],
        },
      ],
    })
    const add = vi.fn()

    await webhookHandler({
      config: { clientSecret: CLIENT_SECRET },
      req: await signedRequest(body),
      queue: { add },
    } as never)

    expect(add).toHaveBeenCalledWith(
      "incomingComment",
      expect.objectContaining({
        data: expect.objectContaining({
          integrationType: "instagramFacebook",
        }),
      }),
    )
  })

  test("incomingMessage is still enqueued with integrationType instagram (unchanged)", async () => {
    const body = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "ig-account-id",
          time: 1_783_674_105,
          messaging: [
            {
              sender: { id: "sender-id" },
              recipient: { id: "recipient-id" },
              timestamp: 1_783_674_105,
              message: { mid: "mid-1", text: "hello" },
            },
          ],
        },
      ],
    })
    const add = vi.fn()

    await webhookHandler({
      config: { clientSecret: CLIENT_SECRET },
      req: await signedRequest(body),
      queue: { add },
    } as never)

    expect(add).toHaveBeenCalledWith(
      "incomingMessage",
      expect.objectContaining({
        data: expect.objectContaining({ integrationType: "instagram" }),
      }),
    )
  })

  test("contactMarkAsRead is still enqueued with integrationType instagram (unchanged)", async () => {
    const body = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "ig-account-id",
          time: 1_783_674_105,
          messaging: [
            {
              sender: { id: "sender-id" },
              recipient: { id: "recipient-id" },
              timestamp: 1_783_674_105,
              read: { watermark: 1_783_674_105 },
            },
          ],
        },
      ],
    })
    const add = vi.fn()

    await webhookHandler({
      config: { clientSecret: CLIENT_SECRET },
      req: await signedRequest(body),
      queue: { add },
    } as never)

    expect(add).toHaveBeenCalledWith(
      "contactMarkAsRead",
      expect.objectContaining({
        data: expect.objectContaining({ integrationType: "instagram" }),
      }),
    )
  })
})
