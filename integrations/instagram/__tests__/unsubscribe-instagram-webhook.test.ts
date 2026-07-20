import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { unsubscribePageFromInstagramWebhook } from "../src/apis/page"
import { DEFAULT_API_VERSION, INSTAGRAM_API_URL } from "../src/constants"

describe("unsubscribePageFromInstagramWebhook", () => {
  test("DELETEs the ig subscribed_apps endpoint with the user access token in the header", async () => {
    let captured: Request | null = null
    server.use(
      http.delete(
        `${INSTAGRAM_API_URL}/${DEFAULT_API_VERSION}/ig-1/subscribed_apps`,
        ({ request }) => {
          captured = request
          return HttpResponse.json({ success: true })
        },
      ),
    )

    await unsubscribePageFromInstagramWebhook({
      igId: "ig-1",
      accessToken: "ig-user-access-token",
      version: DEFAULT_API_VERSION,
    })

    expect(captured).not.toBeNull()
    const url = new URL((captured as Request).url)
    expect(url.pathname).toBe(`/${DEFAULT_API_VERSION}/ig-1/subscribed_apps`)
    expect(url.search).toBe("")
    expect((captured as Request).headers.get("authorization")).toBe(
      "Bearer ig-user-access-token",
    )
  })

  test("throws when Graph returns HTTP 200 with success false", async () => {
    server.use(
      http.delete(
        `${INSTAGRAM_API_URL}/${DEFAULT_API_VERSION}/ig-2/subscribed_apps`,
        () => HttpResponse.json({ success: false }),
      ),
    )

    await expect(
      unsubscribePageFromInstagramWebhook({
        igId: "ig-2",
        accessToken: "ig-user-access-token",
        version: DEFAULT_API_VERSION,
      }),
    ).rejects.toThrow()
  })
})
