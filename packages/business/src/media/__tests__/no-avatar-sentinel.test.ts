import { describe, expect, test } from "vitest"
import {
  AVATAR_REFETCH_AFTER_MS,
  buildNoAvatarSentinel,
  hasRealAvatar,
  isNoAvatarSentinelFresh,
  NO_AVATAR_SENTINEL_KEY,
  parseNoAvatarSentinel,
} from "../no-avatar-sentinel"

describe("no-avatar sentinel", () => {
  test("builds a sentinel with the failure timestamp", () => {
    expect(buildNoAvatarSentinel(1234)).toBe(
      `${NO_AVATAR_SENTINEL_KEY}?time=1234`,
    )
  })

  test("returns null for a real avatar key", () => {
    expect(parseNoAvatarSentinel("public/avatars/contact-1.jpg")).toBeNull()
  })

  test("treats the bare placeholder key as a real avatar key", () => {
    expect(parseNoAvatarSentinel(NO_AVATAR_SENTINEL_KEY)).toBeNull()
    expect(hasRealAvatar(NO_AVATAR_SENTINEL_KEY)).toBe(true)
  })

  test("parses a valid sentinel timestamp", () => {
    expect(parseNoAvatarSentinel(buildNoAvatarSentinel(1234))).toEqual({
      failedAtMs: 1234,
    })
  })

  test.each([
    "invalid",
    "",
    "12ms",
  ])("treats malformed timestamp %j as stale", (timestamp) => {
    expect(
      parseNoAvatarSentinel(`${NO_AVATAR_SENTINEL_KEY}?time=${timestamp}`),
    ).toEqual({ failedAtMs: 0 })
  })

  test("is fresh immediately before the refetch boundary", () => {
    expect(
      isNoAvatarSentinelFresh(1000, 1000 + AVATAR_REFETCH_AFTER_MS - 1),
    ).toBe(true)
  })

  test("is stale at the refetch boundary", () => {
    expect(isNoAvatarSentinelFresh(1000, 1000 + AVATAR_REFETCH_AFTER_MS)).toBe(
      false,
    )
  })

  test("is stale when the failure timestamp is in the future", () => {
    expect(isNoAvatarSentinelFresh(2000, 1000)).toBe(false)
  })

  test("identifies only non-sentinel values as real avatars", () => {
    expect(hasRealAvatar(undefined)).toBe(false)
    expect(hasRealAvatar(null)).toBe(false)
    expect(hasRealAvatar("")).toBe(false)
    expect(hasRealAvatar(buildNoAvatarSentinel(1234))).toBe(false)
    expect(hasRealAvatar("public/avatars/contact-1.jpg")).toBe(true)
  })
})
