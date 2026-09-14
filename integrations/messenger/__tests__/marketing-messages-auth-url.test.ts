import { describe, expect, test } from "vitest"
import {
  generateMarketingMessagesAuthUrl,
  hasMarketingMessages,
  MARKETING_MESSAGES_SCOPE,
} from "../src/apis/auth"

const build = () =>
  new URL(
    generateMarketingMessagesAuthUrl({
      clientId: "app-id",
      configId: "config-id",
      version: "v25.0",
      redirectUrl: "https://example.com/integrations/messenger/callback",
      stateParams: {
        workspaceId: "w1",
        referer: "https://example.com/space/w1/fb-marketing-messages",
        flow: "facebookMarketingMessages",
      },
    }),
  )

describe("generateMarketingMessagesAuthUrl", () => {
  test("targets the versioned Facebook OAuth dialog", () => {
    expect(build().pathname).toBe("/v25.0/dialog/oauth")
  })

  test("sends both app_id and client_id", () => {
    const params = build().searchParams

    expect(params.get("app_id")).toBe("app-id")
    expect(params.get("client_id")).toBe("app-id")
  })

  test("sends the config id and overrides the default response type", () => {
    const params = build().searchParams

    expect(params.get("config_id")).toBe("config-id")
    expect(params.get("override_default_response_type")).toBe("true")
    expect(params.get("response_type")).toBe("code")
  })

  test("rerequests previously declined permissions", () => {
    expect(build().searchParams.get("auth_type")).toBe("rerequest")
  })

  test("omits scope — the config id supplies the permission set", () => {
    expect(build().searchParams.has("scope")).toBe(false)
  })

  test("base64-encodes the state so the callback can dispatch on flow", () => {
    const state = build().searchParams.get("state") ?? ""
    const decoded = JSON.parse(Buffer.from(state, "base64").toString())

    expect(decoded.flow).toBe("facebookMarketingMessages")
    expect(decoded.workspaceId).toBe("w1")
  })
})

describe("hasMarketingMessages", () => {
  test("detects the granted scope", () => {
    expect(
      hasMarketingMessages([MARKETING_MESSAGES_SCOPE, "pages_show_list"]),
    ).toBe(true)
  })

  test("is false when the scope is absent", () => {
    expect(hasMarketingMessages(["pages_show_list"])).toBe(false)
  })

  test("is false when debug_token returned no scopes at all", () => {
    expect(hasMarketingMessages(undefined)).toBe(false)
  })
})
