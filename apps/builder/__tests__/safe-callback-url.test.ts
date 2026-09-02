// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  resolveSafeCallbackUrl,
  withCallbackUrlParam,
} from "@/lib/safe-callback-url"

const CURRENT_ORIGIN = "https://app.example.com"

describe("resolveSafeCallbackUrl", () => {
  test("passes through a relative path unchanged", () => {
    expect(resolveSafeCallbackUrl("/space/1/inbox?tab=x", CURRENT_ORIGIN)).toBe(
      "/space/1/inbox?tab=x",
    )
  })

  test("reduces a same-origin absolute URL to its path, search, and hash", () => {
    expect(
      resolveSafeCallbackUrl(
        `${CURRENT_ORIGIN}/space/1/inbox?tab=x#section`,
        CURRENT_ORIGIN,
      ),
    ).toBe("/space/1/inbox?tab=x#section")
  })

  test("falls back for a different-origin absolute URL", () => {
    expect(
      resolveSafeCallbackUrl("https://evil.example.org/steal", CURRENT_ORIGIN),
    ).toBe("/")
  })

  test("falls back for a different-origin URL even with a matching path", () => {
    expect(
      resolveSafeCallbackUrl(
        "https://evil.example.org/space/1/inbox",
        CURRENT_ORIGIN,
      ),
    ).toBe("/")
  })

  test("falls back for a protocol-relative URL", () => {
    expect(resolveSafeCallbackUrl("//evil.example.org", CURRENT_ORIGIN)).toBe(
      "/",
    )
  })

  test("falls back for a backslash protocol-relative URL", () => {
    expect(resolveSafeCallbackUrl("/\\evil.example.org", CURRENT_ORIGIN)).toBe(
      "/",
    )
  })

  test("falls back for a javascript: URL", () => {
    expect(resolveSafeCallbackUrl("javascript:alert(1)", CURRENT_ORIGIN)).toBe(
      "/",
    )
  })

  test("falls back for null", () => {
    expect(resolveSafeCallbackUrl(null, CURRENT_ORIGIN)).toBe("/")
  })

  test("falls back for an empty string", () => {
    expect(resolveSafeCallbackUrl("", CURRENT_ORIGIN)).toBe("/")
  })

  test("falls back for an unparseable value", () => {
    expect(resolveSafeCallbackUrl("not a url", CURRENT_ORIGIN)).toBe("/")
  })

  test("honors a custom fallback", () => {
    expect(resolveSafeCallbackUrl(null, CURRENT_ORIGIN, "/manage")).toBe(
      "/manage",
    )
  })
})

describe("withCallbackUrlParam", () => {
  test("appends an encoded callbackURL query param when present", () => {
    expect(withCallbackUrlParam("/auth/sign-up", "/space/1/inbox?tab=x")).toBe(
      "/auth/sign-up?callbackURL=%2Fspace%2F1%2Finbox%3Ftab%3Dx",
    )
  })

  test("returns the path unchanged when callbackURL is null", () => {
    expect(withCallbackUrlParam("/auth/sign-up", null)).toBe("/auth/sign-up")
  })

  test("returns the path unchanged when callbackURL is empty", () => {
    expect(withCallbackUrlParam("/auth/sign-up", "")).toBe("/auth/sign-up")
  })
})
