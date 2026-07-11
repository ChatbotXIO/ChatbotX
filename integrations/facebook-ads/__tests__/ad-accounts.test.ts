import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { getAdAccounts, getCustomAudiences } from "../src/apis/ad-accounts"
import { DEFAULT_API_VERSION } from "../src/constants"

const BASE = "https://graph.facebook.com"
const ACCESS_TOKEN = "ADS_TOKEN"

describe("getAdAccounts", () => {
  test("follows paging cursors and merges all pages", async () => {
    const afterParams: (string | null)[] = []

    server.use(
      http.get(
        `${BASE}/${DEFAULT_API_VERSION}/me/adaccounts`,
        ({ request }) => {
          const url = new URL(request.url)
          afterParams.push(url.searchParams.get("after"))

          if (!url.searchParams.get("after")) {
            return HttpResponse.json({
              data: [{ id: "act_1", name: "First" }],
              paging: {
                cursors: { after: "cursor-1" },
                next: `${BASE}/${DEFAULT_API_VERSION}/me/adaccounts?after=cursor-1`,
              },
            })
          }
          return HttpResponse.json({
            data: [{ id: "act_2", name: "Second" }],
            paging: { cursors: { after: "cursor-2" } },
          })
        },
      ),
    )

    const accounts = await getAdAccounts(ACCESS_TOKEN)

    expect(accounts).toEqual([
      { id: "act_1", name: "First" },
      { id: "act_2", name: "Second" },
    ])
    expect(afterParams).toEqual([null, "cursor-1"])
  })
})

describe("getCustomAudiences", () => {
  test("returns a single page and sends the ad account token", async () => {
    let capturedToken: string | null = null

    server.use(
      http.get(
        `${BASE}/${DEFAULT_API_VERSION}/act_9/customaudiences`,
        ({ request }) => {
          capturedToken = new URL(request.url).searchParams.get("access_token")
          return HttpResponse.json({
            data: [{ id: "aud_1", name: "Buyers", subtype: "CUSTOM" }],
          })
        },
      ),
    )

    const audiences = await getCustomAudiences(ACCESS_TOKEN, "act_9")

    expect(audiences).toEqual([
      { id: "aud_1", name: "Buyers", subtype: "CUSTOM" },
    ])
    expect(capturedToken).toBe(ACCESS_TOKEN)
  })
})
