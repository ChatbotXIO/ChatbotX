import { describe, expect, test } from "vitest"
import { generateCapiAuthUrl, INSTAGRAM_CAPI_SCOPES } from "../src/apis/auth"

describe("generateCapiAuthUrl", () => {
  const url = new URL(
    generateCapiAuthUrl({
      clientId: "app-1",
      version: "v25.0",
      redirectUrl:
        "https://broker.example.test/integrations/instagram-facebook/callback",
      stateParams: { flow: "metaCapi", capiIntegrationId: "9" },
    }),
  )

  test("opens the Facebook OAuth dialog for the configured Graph version", () => {
    expect(url.origin).toBe("https://www.facebook.com")
    expect(url.pathname).toBe("/v25.0/dialog/oauth")
    expect(url.searchParams.get("client_id")).toBe("app-1")
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://broker.example.test/integrations/instagram-facebook/callback",
    )
    expect(url.searchParams.get("response_type")).toBe("code")
  })

  test("re-asks a previously declined permission", () => {
    expect(url.searchParams.get("auth_type")).toBe("rerequest")
  })

  test("requests only the Conversions API scopes", () => {
    expect(url.searchParams.get("scope")?.split(",")).toEqual([
      ...INSTAGRAM_CAPI_SCOPES,
    ])
    expect(INSTAGRAM_CAPI_SCOPES).toEqual([
      "instagram_manage_events",
      "instagram_basic",
      "pages_show_list",
    ])
  })

  test("round-trips the state the callback dispatches on", () => {
    expect(JSON.parse(atob(url.searchParams.get("state") ?? ""))).toEqual({
      flow: "metaCapi",
      capiIntegrationId: "9",
    })
  })
})
