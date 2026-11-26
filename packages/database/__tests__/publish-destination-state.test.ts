import {
  derivePublishState,
  missingPublishScopes,
  PUBLISH_REQUIRED_SCOPES,
  type PublishStateInput,
  publishDestinationStates,
  publishDestinationStatuses,
  publisherKeyForInbox,
} from "@chatbotx.io/utils/publish-destination"
import { describe, expect, test } from "vitest"

const base: PublishStateInput = {
  grantedScopes: null,
  inboxStatus: "connected",
  publishStatus: "ok",
  publisherKey: "facebook",
  tokenRefreshError: null,
}

describe("derivePublishState", () => {
  test.each([
    [
      "a disconnected inbox",
      { inboxStatus: "disconnected" },
      "inboxDisconnected",
    ],
    [
      "a disconnected inbox wins over a token error",
      { inboxStatus: "disconnected", tokenRefreshError: "x" },
      "inboxDisconnected",
    ],
    [
      "a rejected token",
      { tokenRefreshError: "publishTokenRejected" },
      "needsReconnect",
    ],
    [
      "a token error wins over a missing permission",
      { publishStatus: "permissionMissing", tokenRefreshError: "x" },
      "needsReconnect",
    ],
    [
      "a permission the network reported missing",
      { publishStatus: "permissionMissing" },
      "permissionMissing",
    ],
    [
      "known scopes that lack a required one",
      { grantedScopes: ["pages_show_list"] },
      "permissionMissing",
    ],
    [
      "known scopes with every required one",
      { grantedScopes: [...PUBLISH_REQUIRED_SCOPES.facebook] },
      "ready",
    ],
    ["Facebook with unknown scopes", {}, "ready"],
    ["Threads with unknown scopes", { publisherKey: "threads" }, "ready"],
    [
      "Threads scopes captured before threads_delete was requested",
      {
        grantedScopes: [
          "threads_basic",
          "threads_content_publish",
          "threads_manage_replies",
        ],
        publisherKey: "threads",
      },
      "permissionMissing",
    ],
    [
      "Threads with every required scope",
      {
        grantedScopes: [...PUBLISH_REQUIRED_SCOPES.threads],
        publisherKey: "threads",
      },
      "ready",
    ],
    [
      "Instagram Login with unknown scopes",
      { publisherKey: "instagram" },
      "permissionMissing",
    ],
    [
      "Instagram through Facebook with unknown scopes",
      { publisherKey: "instagramFacebook" },
      "permissionMissing",
    ],
    [
      "Instagram Login with the publish scope",
      {
        grantedScopes: [...PUBLISH_REQUIRED_SCOPES.instagram],
        publisherKey: "instagram",
      },
      "ready",
    ],
    [
      "Instagram Login without the content publish scope",
      {
        grantedScopes: ["instagram_business_basic"],
        publisherKey: "instagram",
      },
      "permissionMissing",
    ],
    [
      "Instagram through Facebook missing the Page scopes",
      {
        grantedScopes: ["instagram_basic", "instagram_content_publish"],
        publisherKey: "instagramFacebook",
      },
      "permissionMissing",
    ],
    [
      "a connected TikTok login",
      {
        inboxStatus: null,
        publisherKey: "tiktok",
        socialAccount: { isActive: true, status: "connected" },
      },
      "ready",
    ],
    [
      "a TikTok login that needs reauth",
      {
        inboxStatus: null,
        publisherKey: "tiktok",
        socialAccount: { isActive: true, status: "needsReauth" },
      },
      "needsReconnect",
    ],
    [
      "an inactive TikTok destination",
      {
        inboxStatus: null,
        publisherKey: "tiktok",
        socialAccount: { isActive: false, status: "connected" },
      },
      "needsReconnect",
    ],
  ] satisfies [
    string,
    Partial<PublishStateInput>,
    string,
  ][])("%s", (_name, patch, expected) => {
    expect(derivePublishState({ ...base, ...patch })).toBe(expected)
  })

  test("only returns states of the zod enum", () => {
    const state = derivePublishState(base)
    expect(publishDestinationStates.safeParse(state).success).toBe(true)
  })
})

describe("publish scope vocabulary", () => {
  test("lists the scopes each publisher needs", () => {
    expect(PUBLISH_REQUIRED_SCOPES.facebook).toEqual([
      "pages_manage_posts",
      "pages_read_engagement",
      "pages_show_list",
    ])
    expect(PUBLISH_REQUIRED_SCOPES.instagram).toContain(
      "instagram_business_content_publish",
    )
    expect(PUBLISH_REQUIRED_SCOPES.instagramFacebook).toContain(
      "instagram_content_publish",
    )
    expect(PUBLISH_REQUIRED_SCOPES.threads).toEqual([
      "threads_basic",
      "threads_content_publish",
      "threads_manage_replies",
      "threads_delete",
    ])
    expect(PUBLISH_REQUIRED_SCOPES.tiktok).toEqual([
      "user.info.basic",
      "video.publish",
    ])
  })

  test("reports the missing scopes in the required order", () => {
    expect(missingPublishScopes("threads", ["threads_basic"])).toEqual([
      "threads_content_publish",
      "threads_manage_replies",
      "threads_delete",
    ])
  })

  test("maps the Instagram flavour to its publisher", () => {
    expect(
      publisherKeyForInbox({ provider: "instagram", viaFacebook: true }),
    ).toBe("instagramFacebook")
    expect(
      publisherKeyForInbox({ provider: "instagram", viaFacebook: false }),
    ).toBe("instagram")
    expect(
      publisherKeyForInbox({ provider: "facebook", viaFacebook: false }),
    ).toBe("facebook")
  })

  test("the status enum has the two stored values", () => {
    expect(publishDestinationStatuses.options).toEqual([
      "ok",
      "permissionMissing",
    ])
  })
})
