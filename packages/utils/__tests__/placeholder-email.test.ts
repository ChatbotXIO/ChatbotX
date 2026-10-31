import { describe, expect, test } from "vitest"
import {
  facebookPlaceholderEmail,
  isPlaceholderEmail,
  mapFacebookProfileToUser,
} from "../src/placeholder-email"

describe("mapFacebookProfileToUser", () => {
  test("keeps a real Facebook email untouched", () => {
    expect(
      mapFacebookProfileToUser({ id: "123", email: "a@example.com" }),
    ).toEqual({})
  })

  test("substitutes a stable, unverified placeholder for a phone-only account", () => {
    const first = mapFacebookProfileToUser({ id: "123" })
    const second = mapFacebookProfileToUser({ id: "123", email: null })

    expect(first).toEqual({
      email: "fb-123@facebook.placeholder.invalid",
      emailVerified: false,
    })
    expect(second).toEqual(first)
  })

  test("uses the subject claim from a limited-login profile", () => {
    expect(mapFacebookProfileToUser({ sub: "limited-123" })).toEqual({
      email: "fb-limited-123@facebook.placeholder.invalid",
      emailVerified: false,
    })
  })

  test("leaves a profile without an id untouched", () => {
    expect(mapFacebookProfileToUser({ id: "" })).toEqual({})
    expect(mapFacebookProfileToUser({ id: undefined })).toEqual({})
  })
})

describe("isPlaceholderEmail", () => {
  test("recognizes a placeholder regardless of case", () => {
    expect(isPlaceholderEmail(facebookPlaceholderEmail("9"))).toBe(true)
    expect(isPlaceholderEmail("FB-9@FACEBOOK.PLACEHOLDER.INVALID")).toBe(true)
  })

  test("rejects real or missing emails", () => {
    expect(isPlaceholderEmail("a@example.com")).toBe(false)
    expect(isPlaceholderEmail("a@placeholder.invalid")).toBe(false)
    expect(isPlaceholderEmail(null)).toBe(false)
    expect(isPlaceholderEmail(undefined)).toBe(false)
  })
})
