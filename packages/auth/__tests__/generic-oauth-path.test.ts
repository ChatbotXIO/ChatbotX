import { describe, expect, test } from "vitest"
import { isGenericOAuthPath } from "../src/generic-oauth"

describe("isGenericOAuthPath", () => {
  test("matches a social sign-in that selects the generic provider", () => {
    expect(isGenericOAuthPath("/api/auth/sign-in/social", "oidc")).toBe(true)
  })

  test("matches the generic provider callback", () => {
    expect(isGenericOAuthPath("/api/auth/callback/oidc")).toBe(true)
  })

  test("does not gate first-party social providers or unrelated paths", () => {
    expect(isGenericOAuthPath("/api/auth/sign-in/social", "google")).toBe(false)
    expect(isGenericOAuthPath("/api/auth/get-session")).toBe(false)
    expect(isGenericOAuthPath("/api/auth/callback/google")).toBe(false)
  })
})
