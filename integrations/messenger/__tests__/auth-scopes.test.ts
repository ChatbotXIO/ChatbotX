import { describe, expect, test } from "vitest"
import {
  generateAuthUrl,
  hasPageEventsScope,
  MESSENGER_CAPI_SCOPES,
  MESSENGER_REUSE_REQUIRED_SCOPES,
  MESSENGER_SCOPES,
  PAGE_EVENTS_SCOPE,
} from "../src/apis/auth"

describe("Messenger channel login scopes", () => {
  test("do not ask for the Conversions API permission: the Ads tab connects it separately", () => {
    expect(MESSENGER_SCOPES).not.toContain(PAGE_EVENTS_SCOPE)
  })

  test("the connect dialog requests exactly the channel scopes", () => {
    const url = new URL(
      generateAuthUrl({
        clientId: "app-1",
        redirectUrl:
          "https://broker.example.test/integrations/messenger/callback",
      }),
    )

    expect(url.searchParams.get("scope")?.split(",")).toEqual([
      ...MESSENGER_SCOPES,
    ])
    expect(url.searchParams.get("scope")).not.toContain("page_events")
  })

  test("still request everything the channel itself needs", () => {
    expect(MESSENGER_SCOPES).toEqual(
      expect.arrayContaining([
        "pages_messaging",
        "pages_show_list",
        "pages_manage_metadata",
        "pages_read_engagement",
      ]),
    )
  })

  test("a Facebook SSO token is reusable once it carries every non-identity channel scope", () => {
    expect(MESSENGER_REUSE_REQUIRED_SCOPES).toEqual(
      MESSENGER_SCOPES.filter(
        (scope) => scope !== "email" && scope !== "public_profile",
      ),
    )
    expect(MESSENGER_REUSE_REQUIRED_SCOPES).not.toContain(PAGE_EVENTS_SCOPE)
  })
})

describe("Messenger Conversions API scopes", () => {
  test("the dedicated connect carries the permission", () => {
    expect(MESSENGER_CAPI_SCOPES).toContain(PAGE_EVENTS_SCOPE)
  })

  test("a token that has it is still recognised, for rows connected before the split", () => {
    expect(hasPageEventsScope(["pages_messaging", "page_events"])).toBe(true)
    expect(hasPageEventsScope(["pages_messaging"])).toBe(false)
    expect(hasPageEventsScope(undefined)).toBe(false)
  })
})
