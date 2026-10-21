import { describe, expect, test } from "vitest"
import { isGenericOAuthPath } from "../src/generic-oauth"

describe("isGenericOAuthPath", () => {
  test("matches the sign-in entry point", () => {
    expect(isGenericOAuthPath("/api/auth/sign-in/oauth2")).toBe(true)
  })

  test("matches the account-linking entry point", () => {
    expect(isGenericOAuthPath("/api/auth/oauth2/link")).toBe(true)
  })

  test("matches the provider callback, which carries the fixed providerId segment", () => {
    expect(isGenericOAuthPath("/api/auth/oauth2/callback/oidc")).toBe(true)
  })

  test("does not match unrelated or social-provider auth paths", () => {
    expect(isGenericOAuthPath("/api/auth/get-session")).toBe(false)
    expect(isGenericOAuthPath("/api/auth/sign-in/social")).toBe(false)
    expect(isGenericOAuthPath("/api/auth/callback/google")).toBe(false)
  })
})
