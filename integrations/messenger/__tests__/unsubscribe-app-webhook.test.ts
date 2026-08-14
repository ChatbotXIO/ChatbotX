import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import {
  ensureMessengerWhitelistedDomain,
  normalizeMessengerWhitelistedDomain,
  unsubscribePageFromAppWebhook,
} from "../src/apis/page"

const BASE = "https://graph.facebook.com"
const VERSION = "v99.0"

describe("unsubscribePageFromAppWebhook", () => {
  test("DELETEs the page subscribed_apps endpoint with the app token in the header", async () => {
    let captured: Request | null = null
    server.use(
      http.delete(
        `${BASE}/${VERSION}/page-1/subscribed_apps`,
        ({ request }) => {
          captured = request
          return HttpResponse.json({ success: true })
        },
      ),
    )

    await unsubscribePageFromAppWebhook({
      pageId: "page-1",
      appAccessToken: "client-id|client-secret",
      version: VERSION,
    })

    expect(captured).not.toBeNull()
    const url = new URL((captured as Request).url)
    expect(url.pathname).toBe(`/${VERSION}/page-1/subscribed_apps`)
    expect(url.search).toBe("")
    expect((captured as Request).headers.get("authorization")).toBe(
      "Bearer client-id|client-secret",
    )
  })

  test("throws when Graph returns HTTP 200 with success false", async () => {
    server.use(
      http.delete(`${BASE}/${VERSION}/page-2/subscribed_apps`, () =>
        HttpResponse.json({ success: false }),
      ),
    )

    await expect(
      unsubscribePageFromAppWebhook({
        pageId: "page-2",
        appAccessToken: "client-id|client-secret",
        version: VERSION,
      }),
    ).rejects.toThrow()
  })
})

describe("ensureMessengerWhitelistedDomain", () => {
  test("merges the https app origin into existing whitelisted domains", async () => {
    const requests: Request[] = []
    let postedBody: unknown = null
    server.use(
      http.get(`${BASE}/${VERSION}/me/messenger_profile`, ({ request }) => {
        requests.push(request)
        return HttpResponse.json({
          whitelisted_domains: ["https://existing.example"],
        })
      }),
      http.post(
        `${BASE}/${VERSION}/me/messenger_profile`,
        async ({ request }) => {
          requests.push(request)
          postedBody = await request.json()
          return HttpResponse.json({ success: true })
        },
      ),
    )

    await ensureMessengerWhitelistedDomain({
      ctx: {
        auth: {
          tokens: { accessToken: "page-token" },
          version: VERSION,
          metadata: { version: VERSION },
        },
        platform: { appUrl: "https://app.example.test/space/ws-1" },
      } as never,
    })

    expect(requests).toHaveLength(2)
    expect(postedBody).toEqual({
      whitelisted_domains: [
        "https://existing.example",
        "https://app.example.test",
      ],
    })
  })

  test("skips non-https app URLs", async () => {
    let called = false
    server.use(
      http.get(`${BASE}/${VERSION}/me/messenger_profile`, () => {
        called = true
        return HttpResponse.json({ whitelisted_domains: [] })
      }),
    )

    await ensureMessengerWhitelistedDomain({
      ctx: {
        auth: {
          tokens: { accessToken: "page-token" },
          version: VERSION,
          metadata: { version: VERSION },
        },
        platform: { appUrl: "http://localhost:3123" },
      } as never,
    })

    expect(called).toBe(false)
    expect(normalizeMessengerWhitelistedDomain("http://localhost:3123")).toBe(
      undefined,
    )
  })
})
