import { describe, expect, test } from "vitest"
import { deriveAdSourcePlatform } from "../src/referral/ad-source-platform"

describe("deriveAdSourcePlatform", () => {
  test.each([
    ["https://fb.me/3cr4Wqqkv", "facebook"],
    ["https://www.facebook.com/ads/123", "facebook"],
    ["https://facebook.com/story.php?id=1", "facebook"],
    ["https://fb.watch/abc/", "facebook"],
    ["https://www.instagram.com/p/Cxyz/", "instagram"],
    ["https://instagram.com/reel/abc", "instagram"],
    ["https://ig.me/m/somebiz", "instagram"],
  ])("maps %s to %s", (url, platform) => {
    expect(deriveAdSourcePlatform(url)).toBe(platform)
  })

  test.each([
    ["https://example.com/facebook.com", null],
    ["https://notfacebook.com/ad", null],
    ["not a url", null],
    ["", null],
    [null, null],
    [undefined, null],
  ])("returns null for %s", (url, expected) => {
    expect(deriveAdSourcePlatform(url)).toBe(expected)
  })
})
