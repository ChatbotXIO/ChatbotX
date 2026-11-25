import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { DEFAULT_API_VERSION } from "../src/constants"
import { likeComment } from "../src/handlers/comment/comment"
import type { InstagramAuthValue } from "../src/schema"

const auth = {
  tokens: { accessToken: "IG_TOKEN" },
  metadata: { version: DEFAULT_API_VERSION, igId: "ig-1" },
} as unknown as InstagramAuthValue

describe("likeComment (Instagram, Facebook Login)", () => {
  test.each([
    true,
    false,
  ])("liked=%s never calls the network and resolves without error", async (liked) => {
    let requestCount = 0
    server.use(
      http.all("https://graph.facebook.com/*", () => {
        requestCount += 1
        return HttpResponse.json({ success: true })
      }),
    )

    await expect(
      likeComment({
        ctx: { auth } as never,
        data: { commentId: "comment-1", liked },
      } as never),
    ).resolves.toBeUndefined()
    expect(requestCount).toBe(0)
  })
})
