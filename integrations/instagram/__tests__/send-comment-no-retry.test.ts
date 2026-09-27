import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { hideComment, replyToComment } from "../src/apis/comment"
import { API_URL, DEFAULT_API_VERSION } from "../src/constants"
import type { InstagramAuthValue } from "../src/schema"

const ACCESS_TOKEN = "IG_TOKEN"
const COMMENT_ID = "comment-123"

const auth = {
  tokens: { accessToken: ACCESS_TOKEN },
  metadata: { version: DEFAULT_API_VERSION },
} as unknown as InstagramAuthValue

function failWith500() {
  return HttpResponse.json(
    { error: { message: "Service unavailable", code: 2 } },
    { status: 500 },
  )
}

describe("replyToComment (non-idempotent create)", () => {
  test("does not retry on a 500 — a single failed attempt must not risk creating a duplicate live reply", async () => {
    let requestCount = 0
    server.use(
      http.post(
        `${API_URL}/${DEFAULT_API_VERSION}/${COMMENT_ID}/replies`,
        () => {
          requestCount += 1
          return failWith500()
        },
      ),
    )

    await expect(replyToComment(auth, COMMENT_ID, "hello")).rejects.toThrow()
    expect(requestCount).toBe(1)
  })
})

describe("hideComment (idempotent, unaffected by the fix)", () => {
  test("still retries on a 500", async () => {
    let requestCount = 0
    server.use(
      http.post(`${API_URL}/${DEFAULT_API_VERSION}/${COMMENT_ID}`, () => {
        requestCount += 1
        return failWith500()
      }),
    )

    await expect(hideComment(auth, COMMENT_ID, true)).rejects.toThrow()
    expect(requestCount).toBeGreaterThan(1)
  }, 10_000)
})
