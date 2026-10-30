import { describe, expect, test } from "vitest"
import { isGenericOAuthPath } from "../src/generic-oauth"

describe("isGenericOAuthPath", () => {
  test("matches the generic provider callback", () => {
    expect(isGenericOAuthPath("/api/auth/callback/oidc")).toBe(true)
  })

  test("matches a social sign-in selecting the generic provider", () => {
    expect(isGenericOAuthPath("/api/auth/sign-in/social", "oidc")).toBe(true)
    expect(isGenericOAuthPath("/api/auth/sign-up/social", "oidc")).toBe(true)
  })

  test("does not match unrelated or first-party social auth paths", () => {
    expect(isGenericOAuthPath("/api/auth/get-session")).toBe(false)
    expect(isGenericOAuthPath("/api/auth/sign-in/social", "google")).toBe(false)
    expect(isGenericOAuthPath("/api/auth/callback/google")).toBe(false)
  })
})
