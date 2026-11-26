import { describe, expect, test } from "vitest"
import { socialAccountProviders } from "../src/social-account"

const CALLBACK_PATH = /^\/integrations\/[a-z-]+\/callback$/

describe("socialAccountProviders", () => {
  test("only TikTok connects a social account; Meta networks publish with inbox tokens", () => {
    expect(Object.keys(socialAccountProviders)).toEqual(["tiktok"])
  })

  test("the adapter names its own network, platform app and callback path", () => {
    const adapter = socialAccountProviders.tiktok
    expect(adapter.provider).toBe("tiktok")
    expect(adapter.callbackPath).toMatch(CALLBACK_PATH)
    expect(adapter.credentialType).toBe("tiktokPublishing")
  })

  test("TikTok refreshes its token with the app's credentials", () => {
    expect(socialAccountProviders.tiktok.refreshToken).toBeDefined()
    expect(socialAccountProviders.tiktok.refreshUsesAppCredentials).toBe(true)
  })

  test("a timeout does not need a new login", () => {
    expect(
      socialAccountProviders.tiktok.requiresReconnect(
        new Error("socket hang up"),
      ),
    ).toBe(false)
  })
})
