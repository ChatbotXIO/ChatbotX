import { describe, expect, test } from "vitest"
import { generateCapiAuthUrl, MESSENGER_CAPI_SCOPES } from "../src/apis/auth"

const decodeState = (url: URL): unknown =>
  JSON.parse(
    Buffer.from(url.searchParams.get("state") ?? "", "base64").toString(),
  )

describe("generateCapiAuthUrl", () => {
  const url = new URL(
    generateCapiAuthUrl({
      clientId: "app-1",
      version: "v25.0",
      redirectUrl:
        "https://broker.example.test/integrations/messenger/callback",
      stateParams: { flow: "metaCapi", capiIntegrationId: "7" },
    }),
  )

  test("opens the Facebook OAuth dialog for the configured Graph version", () => {
    expect(url.origin).toBe("https://www.facebook.com")
    expect(url.pathname).toBe("/v25.0/dialog/oauth")
    expect(url.searchParams.get("client_id")).toBe("app-1")
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://broker.example.test/integrations/messenger/callback",
    )
    expect(url.searchParams.get("response_type")).toBe("code")
  })

  test("re-asks a previously declined permission", () => {
    expect(url.searchParams.get("auth_type")).toBe("rerequest")
  })

  test("requests only the Conversions API scopes", () => {
    expect(url.searchParams.get("scope")?.split(",")).toEqual([
      ...MESSENGER_CAPI_SCOPES,
    ])
    expect(MESSENGER_CAPI_SCOPES).toEqual(["page_events", "pages_show_list"])
  })

  test("round-trips the state the callback dispatches on", () => {
    expect(decodeState(url)).toEqual({
      flow: "metaCapi",
      capiIntegrationId: "7",
    })
  })
})
