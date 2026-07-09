import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { editComment, sendComment } from "../src/apis/comment"
import { DEFAULT_API_VERSION } from "../src/constants"
import type { MessengerAuthValue } from "../src/schema"

const COMMENT_ID = "comment-123"
const BASE = "https://graph.facebook.com"

const auth = {
  tokens: { accessToken: "PAGE_TOKEN" },
} as unknown as MessengerAuthValue

function failWith500() {
  return HttpResponse.json(
    { error: { message: "Service unavailable", code: 2 } },
    { status: 500 },
  )
}

describe("sendComment (non-idempotent create)", () => {
  test("does not retry on a 500 — a single failed attempt must not risk creating a duplicate live comment", async () => {
    let requestCount = 0
    server.use(
      http.post(`${BASE}/${DEFAULT_API_VERSION}/${COMMENT_ID}/comments`, () => {
        requestCount += 1
        return failWith500()
      }),
    )

    await expect(sendComment(auth, COMMENT_ID, "hello")).rejects.toThrow()
    expect(requestCount).toBe(1)
  })
})

describe("editComment (idempotent, unaffected by the fix)", () => {
  test("still retries on a 500", async () => {
    let requestCount = 0
    server.use(
      http.post(`${BASE}/${DEFAULT_API_VERSION}/${COMMENT_ID}`, () => {
        requestCount += 1
        return failWith500()
      }),
    )

    await expect(editComment(auth, COMMENT_ID, "hello")).rejects.toThrow()
    expect(requestCount).toBeGreaterThan(1)
  }, 10_000)
})
