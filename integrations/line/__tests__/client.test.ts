import { AuthException } from "@chatbotx.io/sdk"
import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"
import { lineFetch } from "../src/apis/client"
import { LineAPIException } from "../src/exception"
import type { LineAuthValue } from "../src/schema"

const auth = {
  authType: "oauth2",
  clientId: "1",
  clientSecret: "s",
  redirectUrl: "",
  tokens: { accessToken: "tok" },
  metadata: { botUserId: "Ubot", basicId: "@bot" },
} as LineAuthValue

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const URL_PUSH = "https://api.line.me/v2/bot/message/push"

describe("lineFetch", () => {
  test("sends bearer auth", async () => {
    let header: string | null = null
    server.use(
      http.get("https://api.line.me/v2/bot/info", ({ request }) => {
        header = request.headers.get("authorization")
        return HttpResponse.json({ userId: "U" })
      }),
    )
    await lineFetch(auth, { method: "GET", path: "/v2/bot/info" })
    expect(header).toBe("Bearer tok")
  })

  test("throws AuthException on 401", async () => {
    server.use(
      http.get("https://api.line.me/v2/bot/info", () =>
        HttpResponse.json(
          { message: "Authentication failed" },
          { status: 401 },
        ),
      ),
    )
    await expect(
      lineFetch(auth, { method: "GET", path: "/v2/bot/info" }),
    ).rejects.toBeInstanceOf(AuthException)
  })

  test("throws LineAPIException on other non-2xx", async () => {
    server.use(
      http.post(URL_PUSH, () =>
        HttpResponse.json({ message: "bad" }, { status: 400 }),
      ),
    )
    await expect(
      lineFetch(auth, {
        method: "POST",
        path: "/v2/bot/message/push",
        body: {},
      }),
    ).rejects.toBeInstanceOf(LineAPIException)
  })

  test("sends X-Line-Retry-Key when retryKey given", async () => {
    let key: string | null = null
    server.use(
      http.post(URL_PUSH, ({ request }) => {
        key = request.headers.get("x-line-retry-key")
        return HttpResponse.json({ sentMessages: [] })
      }),
    )
    await lineFetch(auth, {
      method: "POST",
      path: "/v2/bot/message/push",
      body: {},
      retryKey: "k",
    })
    expect(key).toBe("k")
  })

  test("treats 409 with a retry key as success", async () => {
    server.use(
      http.post(URL_PUSH, () =>
        HttpResponse.json({ message: "conflict" }, { status: 409 }),
      ),
    )
    await expect(
      lineFetch(auth, {
        method: "POST",
        path: "/v2/bot/message/push",
        body: {},
        retryKey: "k",
      }),
    ).resolves.toBeDefined()
  })

  test("retries a keyed POST on 503 with the same retry key", async () => {
    const keys: (string | null)[] = []
    server.use(
      http.post(URL_PUSH, ({ request }) => {
        keys.push(request.headers.get("x-line-retry-key"))
        return keys.length === 1
          ? HttpResponse.json({ message: "down" }, { status: 503 })
          : HttpResponse.json({ sentMessages: [] })
      }),
    )
    await expect(
      lineFetch(auth, {
        method: "POST",
        path: "/v2/bot/message/push",
        body: {},
        retryKey: "k",
      }),
    ).resolves.toBeDefined()
    expect(keys).toEqual(["k", "k"])
  })

  test("does not retry an unkeyed POST on 503", async () => {
    let calls = 0
    server.use(
      http.post(URL_PUSH, () => {
        calls += 1
        return HttpResponse.json({ message: "down" }, { status: 503 })
      }),
    )
    await expect(
      lineFetch(auth, {
        method: "POST",
        path: "/v2/bot/message/push",
        body: {},
      }),
    ).rejects.toBeInstanceOf(LineAPIException)
    expect(calls).toBe(1)
  })

  test("409 without a retry key throws", async () => {
    server.use(
      http.post(URL_PUSH, () =>
        HttpResponse.json({ message: "conflict" }, { status: 409 }),
      ),
    )
    await expect(
      lineFetch(auth, {
        method: "POST",
        path: "/v2/bot/message/push",
        body: {},
      }),
    ).rejects.toBeInstanceOf(LineAPIException)
  })
})
