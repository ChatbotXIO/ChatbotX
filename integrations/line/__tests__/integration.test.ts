import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import { integration } from "../src/integration"
import type { LineAuthValue } from "../src/schema"

const BASE = "https://api.line.me"
const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const auth: LineAuthValue = {
  authType: "oauth2",
  clientId: "123",
  clientSecret: "secret",
  redirectUrl: "",
  tokens: { accessToken: "old-token" },
  metadata: { botUserId: "Ubot", basicId: "@bot" },
}

const ctx = (extra: Record<string, unknown> = {}) =>
  ({ auth, storagePrefix: "w1", ...extra }) as never

const OURS = "https://app.example/webhook/line/1"

const endpointHandlers = (existing: string) => [
  http.get(`${BASE}/v2/bot/channel/webhook/endpoint`, () =>
    HttpResponse.json({ endpoint: existing, active: true }),
  ),
  http.put(`${BASE}/v2/bot/channel/webhook/endpoint`, () =>
    HttpResponse.json({}),
  ),
  http.post(`${BASE}/v2/bot/channel/webhook/test`, () =>
    HttpResponse.json({ success: true, reason: "OK" }),
  ),
]

describe("line integration", () => {
  test("refreshAuth issues a new token and does not revoke the old one", async () => {
    let revoked: string | null = null
    server.use(
      http.post(`${BASE}/v2/oauth/accessToken`, () =>
        HttpResponse.json({
          access_token: "new-token",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      ),
      http.post(`${BASE}/v2/oauth/revoke`, async ({ request }) => {
        revoked = new URLSearchParams(await request.text()).get("access_token")
        return HttpResponse.json({})
      }),
    )
    const next = await integration.refreshAuth?.({ auth })
    expect(next?.tokens.accessToken).toBe("new-token")
    expect(next?.tokens.expiresAt).toBeDefined()
    expect(revoked).toBeNull()
  })

  test("registerWebhook reports a foreign previous endpoint", async () => {
    server.use(...endpointHandlers("https://other.example/hook"))
    const result = await integration.actions.registerWebhook({
      auth,
      webhookUrl: OURS,
    })
    expect(result).toEqual({ previousWebhookUrl: "https://other.example/hook" })
  })

  test("registerWebhook returns null when our URL is already set", async () => {
    server.use(...endpointHandlers(OURS))
    const result = await integration.actions.registerWebhook({
      auth,
      webhookUrl: OURS,
    })
    expect(result.previousWebhookUrl).toBeNull()
  })

  test("registerWebhook does not run the webhook test", async () => {
    let tested = false
    server.use(
      ...endpointHandlers(""),
      http.post(`${BASE}/v2/bot/channel/webhook/test`, () => {
        tested = true
        return HttpResponse.json({ success: true })
      }),
    )
    await integration.actions.registerWebhook({ auth, webhookUrl: OURS })
    expect(tested).toBe(false)
  })

  test("testWebhook reports success and the active toggle", async () => {
    server.use(...endpointHandlers(OURS))
    const result = await integration.actions.testWebhook({ auth })
    expect(result).toEqual({ success: true, reason: undefined, active: true })
  })

  test("testWebhook never throws when the test errors", async () => {
    server.use(
      http.post(`${BASE}/v2/bot/channel/webhook/test`, () =>
        HttpResponse.json({ message: "boom" }, { status: 400 }),
      ),
      ...endpointHandlers(OURS),
    )
    const result = await integration.actions.testWebhook({ auth })
    expect(result.success).toBe(false)
    expect(result.active).toBe(true)
  })

  test("getProfile maps displayName, pictureUrl and language (as locale)", async () => {
    server.use(
      http.get(`${BASE}/v2/bot/profile/U1`, () =>
        HttpResponse.json({
          userId: "U1",
          displayName: "Ann",
          pictureUrl: "https://p/x.jpg",
          language: "vi",
        }),
      ),
    )
    const profile = await integration.runChannelHandler(
      "contact",
      "getProfile",
      { ctx: ctx(), data: { sourceId: "U1" } },
    )
    expect(profile).toEqual({
      sourceId: "U1",
      firstName: "Ann",
      avatar: "https://p/x.jpg",
      locale: "vi",
    })
  })

  test("sendTyping(false) makes no call; true starts loading", async () => {
    const hits: unknown[] = []
    server.use(
      http.post(`${BASE}/v2/bot/chat/loading/start`, async ({ request }) => {
        hits.push(await request.json())
        return HttpResponse.json({})
      }),
    )
    const contact = { sourceId: "U1", id: "c1" }
    await integration.runChannelHandler("conversation", "sendTyping", {
      ctx: ctx(),
      data: { contact, typing: false },
    })
    expect(hits).toHaveLength(0)
    await integration.runChannelHandler("conversation", "sendTyping", {
      ctx: ctx(),
      data: { contact, typing: true },
    })
    expect(hits).toEqual([{ chatId: "U1", loadingSeconds: 5 }])
  })

  test("a 401 on push refreshes the token via the SDK and retries", async () => {
    const pushAuth: string[] = []
    server.use(
      http.post(`${BASE}/v2/bot/message/push`, ({ request }) => {
        pushAuth.push(request.headers.get("authorization") ?? "")
        if (pushAuth.length === 1) {
          return HttpResponse.json({ message: "expired" }, { status: 401 })
        }
        return HttpResponse.json({ sentMessages: [{ id: "m1" }] })
      }),
      http.post(`${BASE}/v2/oauth/accessToken`, () =>
        HttpResponse.json({
          access_token: "fresh",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      ),
      http.post(`${BASE}/v2/oauth/revoke`, () => HttpResponse.json({})),
    )
    const save = vi.fn().mockResolvedValue(undefined)
    const authStore = { load: vi.fn().mockResolvedValue(auth), save }

    await integration.runChannelHandler("message", "sendMessage", {
      ctx: ctx({ authStore }),
      data: {
        contact: { sourceId: "U1", id: "c1" },
        message: { contentType: "text", text: "hi" },
      },
    } as never)

    expect(pushAuth).toEqual(["Bearer old-token", "Bearer fresh"])
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]?.[0].tokens.accessToken).toBe("fresh")
  })

  test("invalid_client on refresh is terminal and marks the integration offline", async () => {
    let tokenCalls = 0
    server.use(
      http.post(`${BASE}/v2/bot/message/push`, () =>
        HttpResponse.json({ message: "expired" }, { status: 401 }),
      ),
      http.post(`${BASE}/v2/oauth/accessToken`, () => {
        tokenCalls += 1
        return HttpResponse.json(
          { error: "invalid_client", error_description: "secret reset" },
          { status: 400 },
        )
      }),
    )
    const markOffline = vi.fn().mockResolvedValue(undefined)
    const authStore = {
      load: vi.fn().mockResolvedValue(auth),
      save: vi.fn(),
      markOffline,
    }
    await expect(
      integration.runChannelHandler("message", "sendMessage", {
        ctx: ctx({ authStore }),
        data: {
          contact: { sourceId: "U1", id: "c1" },
          message: { contentType: "text", text: "hi" },
        },
      } as never),
    ).rejects.toThrow("auth refresh failed")
    expect(tokenCalls).toBe(1)
    expect(markOffline).toHaveBeenCalledTimes(1)
    expect(authStore.save).not.toHaveBeenCalled()
  })

  test("a 401 on getProfile refreshes and retries", async () => {
    let n = 0
    server.use(
      http.get(`${BASE}/v2/bot/profile/U1`, () => {
        n += 1
        return n === 1
          ? HttpResponse.json({ message: "expired" }, { status: 401 })
          : HttpResponse.json({ userId: "U1", displayName: "Ann" })
      }),
      http.post(`${BASE}/v2/oauth/accessToken`, () =>
        HttpResponse.json({
          access_token: "fresh",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      ),
      http.post(`${BASE}/v2/oauth/revoke`, () => HttpResponse.json({})),
    )
    const authStore = { load: vi.fn().mockResolvedValue(auth), save: vi.fn() }
    const profile = await integration.runChannelHandler(
      "contact",
      "getProfile",
      {
        ctx: ctx({ authStore }),
        data: { sourceId: "U1" },
      },
    )
    expect(profile.firstName).toBe("Ann")
    expect(authStore.save).toHaveBeenCalledTimes(1)
  })
})
