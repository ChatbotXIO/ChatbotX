import { describe, expect, test } from "vitest"
import {
  generateAuthUrl,
  hasInstagramManageEventsScope,
  INSTAGRAM_CAPI_SCOPES,
  INSTAGRAM_MANAGE_EVENTS_SCOPE,
  INSTAGRAM_SCOPES,
} from "../src/apis/auth"
import { integration } from "../src/integration"

type ChannelConnection = {
  authorizeUrl: (input: {
    credential: unknown
    callbackUrl: string
    state: string
  }) => string
}

/** The scopes the integration definition's own authorize URL requests. */
const definitionScopes = (): string[] => {
  const connection = integration.connection as unknown as ChannelConnection
  const url = new URL(
    connection.authorizeUrl({
      credential: { clientId: "app-1", version: "v25.0" },
      callbackUrl:
        "https://broker.example.test/integrations/instagram-facebook/callback",
      state: "state",
    }),
  )
  return url.searchParams.get("scope")?.split(",") ?? []
}

describe("Instagram (Facebook login) channel scopes", () => {
  test("do not ask for the Conversions API permission: the Ads tab connects it separately", () => {
    expect(INSTAGRAM_SCOPES).not.toContain(INSTAGRAM_MANAGE_EVENTS_SCOPE)
  })

  test("the connect dialog requests exactly the channel scopes", () => {
    const url = new URL(
      generateAuthUrl({
        clientId: "app-1",
        redirectUrl:
          "https://broker.example.test/integrations/instagram-facebook/callback",
      }),
    )

    expect(url.searchParams.get("scope")?.split(",")).toEqual([
      ...INSTAGRAM_SCOPES,
    ])
  })

  test("the integration definition declares the same scopes as the dialog", () => {
    expect(definitionScopes()).toEqual([...INSTAGRAM_SCOPES])
  })

  test("still request everything the channel itself needs", () => {
    expect(INSTAGRAM_SCOPES).toEqual(
      expect.arrayContaining([
        "instagram_basic",
        "instagram_manage_messages",
        "pages_show_list",
        "pages_messaging",
      ]),
    )
  })
})

describe("Instagram Conversions API scopes", () => {
  test("the dedicated connect carries the permission", () => {
    expect(INSTAGRAM_CAPI_SCOPES).toContain(INSTAGRAM_MANAGE_EVENTS_SCOPE)
  })

  test("a token that has it is still recognised, for rows connected before the split", () => {
    expect(
      hasInstagramManageEventsScope([
        "instagram_basic",
        "instagram_manage_events",
      ]),
    ).toBe(true)
    expect(hasInstagramManageEventsScope(["instagram_basic"])).toBe(false)
    expect(hasInstagramManageEventsScope(undefined)).toBe(false)
  })
})
