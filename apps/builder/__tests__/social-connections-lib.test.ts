// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  needsReconnectAction,
  type PublishDestination,
  showsViaFacebookTag,
  toInboxNetworkGroups,
} from "@/features/social-accounts/lib/connections"

const destination = (
  overrides: Partial<PublishDestination> = {},
): PublishDestination => ({
  avatar: null,
  contentTypes: ["text"],
  externalId: "ext-1",
  id: "d-1",
  inboxId: "i-1",
  integrationId: "int-1",
  missingScopes: [],
  name: "Page",
  pausedUntil: null,
  pauseReason: null,
  profileUrl: null,
  provider: "facebook",
  socialAccountId: null,
  state: "ready",
  viaFacebook: false,
  ...overrides,
})

describe("toInboxNetworkGroups", () => {
  test("hides a network without inboxes and the TikTok group", () => {
    const groups = toInboxNetworkGroups([
      { destinations: [destination()], provider: "facebook", truncated: false },
      { destinations: [], provider: "instagram", truncated: false },
      {
        destinations: [destination({ provider: "tiktok" })],
        provider: "tiktok",
        truncated: false,
      },
    ])
    expect(groups.map((group) => group.provider)).toEqual(["facebook"])
  })

  test("lists only connected inboxes", () => {
    const groups = toInboxNetworkGroups([
      {
        destinations: [
          destination({ id: "a" }),
          destination({ id: "b", state: "inboxDisconnected" }),
        ],
        provider: "facebook",
        truncated: true,
      },
    ])
    expect(groups[0]?.destinations.map((item) => item.id)).toEqual(["a"])
    expect(groups[0]?.truncated).toBe(true)
  })
})

describe("destination states", () => {
  test("only a destination that cannot publish offers a button", () => {
    expect(needsReconnectAction("ready")).toBe(false)
    expect(needsReconnectAction("needsReconnect")).toBe(true)
    expect(needsReconnectAction("permissionMissing")).toBe(true)
  })

  test("only Instagram through Facebook carries the via Facebook tag", () => {
    expect(
      showsViaFacebookTag({ provider: "instagram", viaFacebook: true }),
    ).toBe(true)
    expect(
      showsViaFacebookTag({ provider: "instagram", viaFacebook: false }),
    ).toBe(false)
    expect(
      showsViaFacebookTag({ provider: "facebook", viaFacebook: false }),
    ).toBe(false)
  })
})
