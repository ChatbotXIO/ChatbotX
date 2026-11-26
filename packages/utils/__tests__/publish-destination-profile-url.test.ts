import { describe, expect, test } from "vitest"
import { buildPublishDestinationProfileUrl } from "../src/publish-destination"

const build = (
  provider: "facebook" | "instagram" | "threads" | "tiktok",
  externalId: string | null,
  username: string | null,
): string | null =>
  buildPublishDestinationProfileUrl({ externalId, provider, username })

describe("buildPublishDestinationProfileUrl", () => {
  test("builds a Facebook Page URL from the numeric page id", () => {
    expect(build("facebook", "1234567890", null)).toBe(
      "https://www.facebook.com/1234567890",
    )
  })

  test("returns null for a Facebook id that is not numeric", () => {
    expect(build("facebook", "../evil", null)).toBeNull()
    expect(build("facebook", null, null)).toBeNull()
  })

  test("builds Instagram, Threads and TikTok URLs from the username", () => {
    expect(build("instagram", null, "acme.shop")).toBe(
      "https://www.instagram.com/acme.shop",
    )
    expect(build("threads", null, "acme_shop")).toBe(
      "https://www.threads.net/@acme_shop",
    )
    expect(build("tiktok", null, "@acme")).toBe("https://www.tiktok.com/@acme")
  })

  test("returns null without a username", () => {
    expect(build("instagram", "17841", null)).toBeNull()
    expect(build("tiktok", null, "")).toBeNull()
  })

  test("rejects handles that could change the host or path", () => {
    expect(build("instagram", null, "a/b")).toBeNull()
    expect(build("threads", null, "evil.com/x?y")).toBeNull()
    expect(build("tiktok", null, "a b")).toBeNull()
    expect(build("instagram", null, "@@x")).toBeNull()
  })
})
