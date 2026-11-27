import { describe, expect, test } from "vitest"
import {
  deriveSocialPublishingState,
  MAX_SOCIAL_DESTINATIONS_PER_ACCOUNT,
  missingSocialScopes,
  SOCIAL_PROVIDER_CAPABILITIES,
  SOCIAL_PROVIDER_INBOX_CHANNEL,
  socialAccountStatusReasons,
  socialProviders,
} from "../src/social-account"

describe("social provider capabilities", () => {
  test("every network has an entry", () => {
    for (const provider of socialProviders.options) {
      expect(SOCIAL_PROVIDER_CAPABILITIES[provider]).toBeDefined()
    }
  })

  test("a connectable network asks for the documented publishing permissions only", () => {
    expect(SOCIAL_PROVIDER_CAPABILITIES.facebook.requiredScopes).toEqual([
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement",
    ])
    expect(SOCIAL_PROVIDER_CAPABILITIES.instagram.requiredScopes).toEqual([
      "instagram_business_basic",
      "instagram_business_content_publish",
    ])
    expect(SOCIAL_PROVIDER_CAPABILITIES.threads.requiredScopes).toEqual([
      "threads_basic",
      "threads_content_publish",
      "threads_manage_replies",
      "threads_delete",
    ])
  })

  test("TikTok requests the Login Kit and direct post scopes", () => {
    expect(SOCIAL_PROVIDER_CAPABILITIES.tiktok).toMatchObject({
      requiredScopes: ["user.info.basic", "video.publish"],
    })
  })

  test("Facebook destinations are Pages, the others own one profile", () => {
    expect(SOCIAL_PROVIDER_CAPABILITIES.facebook.destinationKind).toBe("page")
    expect(SOCIAL_PROVIDER_CAPABILITIES.instagram.destinationKind).toBe(
      "profile",
    )
    expect(SOCIAL_PROVIDER_CAPABILITIES.threads.destinationKind).toBe("profile")
  })

  test("a login keeps at most one hundred destinations", () => {
    expect(MAX_SOCIAL_DESTINATIONS_PER_ACCOUNT).toBe(100)
  })
})

describe("missingSocialScopes", () => {
  test("nothing is missing when every required scope was granted", () => {
    expect(
      missingSocialScopes("threads", [
        "threads_basic",
        "threads_content_publish",
        "threads_manage_replies",
        "threads_delete",
      ]),
    ).toEqual([])
  })

  test("extra granted scopes are ignored", () => {
    expect(
      missingSocialScopes("threads", [
        "threads_basic",
        "threads_content_publish",
        "threads_manage_replies",
        "threads_delete",
        "threads_read_replies",
      ]),
    ).toEqual([])
  })

  test("the names of the withheld scopes come back as the platform spells them", () => {
    expect(missingSocialScopes("facebook", ["pages_show_list"])).toEqual([
      "pages_manage_posts",
      "pages_read_engagement",
    ])
  })

  test("a login that granted nothing misses every scope", () => {
    expect(missingSocialScopes("instagram", [])).toEqual([
      ...SOCIAL_PROVIDER_CAPABILITIES.instagram.requiredScopes,
    ])
  })

  test("a withheld TikTok permission is named", () => {
    expect(
      missingSocialScopes("tiktok", ["user.info.basic", "video.upload"]),
    ).toEqual(["video.publish"])
  })

  test("a Threads login granted before delete existed is missing threads_delete", () => {
    expect(
      missingSocialScopes("threads", [
        "threads_basic",
        "threads_content_publish",
        "threads_manage_replies",
      ]),
    ).toEqual(["threads_delete"])
  })

  test("a TikTok login without the draft scope misses nothing", () => {
    expect(
      missingSocialScopes("tiktok", ["user.info.basic", "video.publish"]),
    ).toEqual([])
  })
})

describe("socialAccountStatusReasons", () => {
  test("is the finite set the UI maps to translations", () => {
    expect(socialAccountStatusReasons.options).toEqual([
      "tokenRejected",
      "tokenExpired",
      "refreshRejected",
      "permissionNotGranted",
    ])
  })

  test("carries no permission names: those are read from missingScopes", () => {
    expect(
      socialAccountStatusReasons.safeParse("permissionNotGranted").success,
    ).toBe(true)
    expect(
      socialAccountStatusReasons.safeParse(
        "permissionNotGranted:pages_manage_posts",
      ).success,
    ).toBe(false)
  })
})

describe("deriveSocialPublishingState", () => {
  const ready = {
    accountStatus: "connected" as const,
    isActive: true,
    missingScopes: [],
  }

  test("is ready for a connected account, an active destination and no missing scope", () => {
    expect(deriveSocialPublishingState(ready)).toBe("ready")
  })

  test.each([
    [
      "the account needs a reconnect",
      { accountStatus: "needsReauth" as const },
    ],
    ["the account is disconnected", { accountStatus: "disconnected" as const }],
    ["the destination is inactive", { isActive: false }],
    ["a scope is missing", { missingScopes: ["pages_manage_posts"] }],
  ])("needs a reconnect when %s", (_name, override) => {
    expect(deriveSocialPublishingState({ ...ready, ...override })).toBe(
      "needsReconnect",
    )
  })

  test("every network maps to its inbox channel", () => {
    expect(SOCIAL_PROVIDER_INBOX_CHANNEL).toEqual({
      facebook: "messenger",
      instagram: "instagram",
      threads: "threads",
      tiktok: "tiktok",
    })
  })
})
