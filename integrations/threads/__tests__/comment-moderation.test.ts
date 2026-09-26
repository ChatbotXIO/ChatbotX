import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test, vi } from "vitest"
import { getReplyGifUrl, setReplyHidden } from "../src/apis/comment"
import { THREADS_GRAPH_API_URL } from "../src/constants"
import { hideComment } from "../src/handlers/comment/comment-state"
import type { ThreadsAuthValue } from "../src/schema"

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn() },
}))

const auth = {
  tokens: { accessToken: "threads-token" },
  metadata: {
    threadsUserId: "threads-user-1",
    username: "chatbotx",
    version: "v1.0",
  },
} as ThreadsAuthValue

describe("threads reply moderation", () => {
  test.each([true, false])("posts hide=%s to manage_reply", async (hidden) => {
    let body = ""
    server.use(
      http.post(
        `${THREADS_GRAPH_API_URL}/v1.0/reply-1/manage_reply`,
        async ({ request }) => {
          body = await request.text()
          return HttpResponse.json({ success: true })
        },
      ),
    )

    await setReplyHidden(auth, "reply-1", hidden)

    expect(body).toContain(`hide=${hidden}`)
    expect(body).toContain("access_token=threads-token")
  })

  test("hideComment surfaces an API rejection as a channel error", async () => {
    server.use(
      http.post(`${THREADS_GRAPH_API_URL}/v1.0/reply-2/manage_reply`, () =>
        HttpResponse.json(
          { error: { message: "Not a top-level reply", code: 100 } },
          { status: 400 },
        ),
      ),
    )

    await expect(
      hideComment({
        ctx: { auth } as never,
        data: { commentId: "reply-2", hidden: true },
      }),
    ).rejects.toThrow()
  })
})

describe("threads reply GIF lookup", () => {
  test("returns the reply's gif_url", async () => {
    server.use(
      http.get(`${THREADS_GRAPH_API_URL}/v1.0/reply-1`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("fields")).toBe("gif_url")
        return HttpResponse.json({ gif_url: "https://media.giphy.com/a.gif" })
      }),
    )

    await expect(getReplyGifUrl(auth, "reply-1")).resolves.toBe(
      "https://media.giphy.com/a.gif",
    )
  })

  test("returns null for a reply with no GIF", async () => {
    server.use(
      http.get(`${THREADS_GRAPH_API_URL}/v1.0/reply-1`, () =>
        HttpResponse.json({ id: "reply-1" }),
      ),
    )

    await expect(getReplyGifUrl(auth, "reply-1")).resolves.toBeNull()
  })
})
