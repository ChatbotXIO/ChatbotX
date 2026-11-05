import { describe, expect, test } from "vitest"
import { decodeOAuthState } from "@/lib/oauth-state"

const BASE64URL_ONLY_CHARACTERS = /[-_]/

const tiktokState = {
  workspaceId: "0b6c2f5e-6a3e-4c55-9d0f-3f1f4f2a9e11",
  referer:
    "https://app.chatbotx.io/space/0b6c2f5e-6a3e-4c55-9d0f-3f1f4f2a9e11/settings/channels?channel=tiktok",
}

describe("decodeOAuthState", () => {
  test("decodes a base64url state containing - or _ (TikTok)", () => {
    const encoded = Buffer.from(JSON.stringify(tiktokState)).toString(
      "base64url",
    )
    expect(encoded).toMatch(BASE64URL_ONLY_CHARACTERS)
    expect(() => atob(encoded)).toThrow()

    expect(decodeOAuthState(encoded)).toEqual(tiktokState)
  })

  test("decodes a standard base64 state from btoa (other integrations)", () => {
    const state = { workspaceId: "ws_1", referer: "https://x.io/a?b=c&d=e" }
    const encoded = btoa(JSON.stringify(state))

    expect(decodeOAuthState(encoded)).toEqual(state)
  })

  test("decodes a percent-encoded state param", () => {
    const state = { workspaceId: "ws_1" }
    const encoded = encodeURIComponent(btoa(JSON.stringify(state)))

    expect(decodeOAuthState(encoded)).toEqual(state)
  })

  test("throws on a state that is not base64 JSON", () => {
    expect(() => decodeOAuthState("not-json")).toThrow()
  })
})
