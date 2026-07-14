import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { unsubscribePageFromAppWebhook } from "../src/apis/page"

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
