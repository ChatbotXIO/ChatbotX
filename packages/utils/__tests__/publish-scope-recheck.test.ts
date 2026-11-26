import { describe, expect, test } from "vitest"
import {
  PUBLISH_SCOPE_RECHECK_SOURCE,
  scopesFromDebugToken,
} from "../src/publish-destination"

describe("scopesFromDebugToken", () => {
  test("a list of strings is the granted permissions", () => {
    expect(
      scopesFromDebugToken({ is_valid: true, scopes: ["a", "b"] }),
    ).toEqual({ kind: "scopes", scopes: ["a", "b"] })
  })

  test("is_valid false wins over a scope list", () => {
    expect(scopesFromDebugToken({ is_valid: false, scopes: ["a"] })).toEqual({
      kind: "invalidToken",
    })
  })

  test.each([
    {},
    { scopes: "a" },
    { scopes: ["a", 1] },
    { scopes: null },
  ])("%j claims nothing", (data) => {
    expect(scopesFromDebugToken(data)).toEqual({ kind: "unreported" })
  })
})

describe("PUBLISH_SCOPE_RECHECK_SOURCE", () => {
  test("only the Facebook-token networks have a documented source", () => {
    expect(PUBLISH_SCOPE_RECHECK_SOURCE).toEqual({
      facebook: "debugToken",
      instagram: null,
      instagramFacebook: "debugToken",
      threads: null,
      tiktok: null,
    })
  })
})
