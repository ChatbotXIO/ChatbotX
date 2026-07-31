import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test, vi } from "vitest"
import { sendPrivateReply } from "../src/apis/comment"
import { listInstagramMedia } from "../src/apis/post"
import { DEFAULT_API_VERSION, INSTAGRAM_API_URL } from "../src/constants"
import { webhookHandler } from "../src/handlers/webhook"
import { hmacSha256Hex } from "../src/lib/webhook"
import type { InstagramAuthValue } from "../src/schemas"

const ACCESS_TOKEN = "instagram-login-token"
const COMMENT_ID = "comment-123"

const auth = {
  tokens: { accessToken: ACCESS_TOKEN },
  metadata: { version: DEFAULT_API_VERSION },
} as InstagramAuthValue

describe("Instagram Login comment automation APIs", () => {
  test.each([
    ["post", "post-media-id", "FEED"],
    ["Reel", "reel-media-id", "REELS"],
  ])("queues the webhook media.id for a selected %s", async (_, mediaId, mediaProductType) => {
    const clientSecret = "webhook-secret"
    const body = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "ig-account-id",
          time: 1_783_674_105,
          field: "comments",
          value: {
            id: "comment-id",
            text: "keyword",
            from: { id: "author-id" },
            media: {
              id: mediaId,
              media_product_type: mediaProductType,
            },
          },
        },
      ],
    })
    const signature = await hmacSha256Hex(clientSecret, body)
    const add = vi.fn()

    await webhookHandler({
      config: { clientSecret },
      req: new Request("https://example.test/webhook", {
        method: "POST",
        body,
        headers: { "x-hub-signature-256": `sha256=${signature}` },
      }),
      queue: { add },
    } as never)

    expect(add).toHaveBeenCalledWith(
      "incomingComment",
      expect.objectContaining({
        data: expect.objectContaining({
          commentData: expect.objectContaining({ postId: mediaId }),
        }),
      }),
    )
  })

  test("lists posts and Reels from graph.instagram.com using webhook-compatible media ids", async () => {
    server.use(
      http.get(
        `${INSTAGRAM_API_URL}/${DEFAULT_API_VERSION}/me/media`,
        ({ request }) => {
          expect(request.headers.get("authorization")).toBe(
            `Bearer ${ACCESS_TOKEN}`,
          )
          expect(new URL(request.url).searchParams.get("fields")).toContain(
            "media_product_type",
          )
          return HttpResponse.json({
            data: [
              {
                id: "post-media-id",
                timestamp: "2026-07-16T00:00:00Z",
                media_product_type: "FEED",
              },
              {
                id: "reel-media-id",
                timestamp: "2026-07-16T01:00:00Z",
                media_product_type: "REELS",
              },
            ],
          })
        },
      ),
    )

    await expect(listInstagramMedia({ auth })).resolves.toEqual([
      expect.objectContaining({ id: "post-media-id" }),
      expect.objectContaining({ id: "reel-media-id" }),
    ])
  })

  test("sends a comment private reply through graph.instagram.com", async () => {
    server.use(
      http.post(
        `${INSTAGRAM_API_URL}/${DEFAULT_API_VERSION}/me/messages`,
        async ({ request }) => {
          expect(request.headers.get("authorization")).toBe(
            `Bearer ${ACCESS_TOKEN}`,
          )
          await expect(request.json()).resolves.toEqual({
            recipient: { comment_id: COMMENT_ID },
            message: { text: "Hello from Instagram Login" },
          })
          return HttpResponse.json({ recipient_id: "recipient-1" })
        },
      ),
    )

    await expect(
      sendPrivateReply(auth, COMMENT_ID, "Hello from Instagram Login"),
    ).resolves.toEqual({ recipient_id: "recipient-1" })
  })
})
