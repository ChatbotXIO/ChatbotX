// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  assertTokenScope,
  tokenHasAnyScope,
} from "../src/lib/public-api/token-scope"

// `requireTokenScope` in @/orpc delegates to `tokenHasAnyScope`, so these pin
// the scope rule every workspace-token route relies on.
describe("tokenHasAnyScope", () => {
  test("null and undefined scopes mean all scopes", () => {
    expect(tokenHasAnyScope(null, ["appointments"])).toBe(true)
    expect(tokenHasAnyScope(undefined, ["inbox"])).toBe(true)
  })

  test("is any-of, never all-of", () => {
    expect(tokenHasAnyScope(["inbox"], ["appointments", "inbox"])).toBe(true)
    expect(tokenHasAnyScope(["contacts"], ["appointments", "inbox"])).toBe(
      false,
    )
  })

  test("an empty scope list grants nothing", () => {
    expect(tokenHasAnyScope([], ["appointments"])).toBe(false)
  })
})

describe("assertTokenScope", () => {
  test("passes for a token with the scope or with all scopes", () => {
    expect(() =>
      assertTokenScope({ apiToken: { scopes: ["inbox"] } }, "inbox"),
    ).not.toThrow()
    expect(() =>
      assertTokenScope({ apiToken: { scopes: null } }, "inbox"),
    ).not.toThrow()
    // Member/session callers carry no token and are scoped elsewhere.
    expect(() => assertTokenScope({}, "inbox")).not.toThrow()
  })

  test("throws FORBIDDEN with the middleware's message format", () => {
    expect(() =>
      assertTokenScope({ apiToken: { scopes: ["appointments"] } }, "inbox"),
    ).toThrow(
      expect.objectContaining({
        code: "FORBIDDEN",
        message: "Token is not authorized for the 'inbox' scope",
      }),
    )
  })
})
