import { describe, expect, test } from "vitest"
import {
  OAUTH_ERROR_MESSAGE_KEYS,
  resolveOAuthErrorKey,
  withoutOAuthError,
} from "@/features/auth/oauth-error"

const TRANSLATION_KEY_PATTERN = /^auth\.oauthError\.[a-zA-Z]+$/
const origin = "https://app.example.test"
const params = (query: string) => new URLSearchParams(query)
const nested = (target: string) => `callbackURL=${encodeURIComponent(target)}`

describe("resolveOAuthErrorKey", () => {
  test("reads a direct ?error= code", () => {
    expect(
      resolveOAuthErrorKey(params("error=account_not_linked"), origin),
    ).toBe("accountNotLinked")
  })

  test("maps account_already_linked_to_different_user to unableToLinkAccount", () => {
    expect(
      resolveOAuthErrorKey(
        params("error=account_already_linked_to_different_user"),
        origin,
      ),
    ).toBe("unableToLinkAccount")
  })

  test("reads the code the proxy hid inside an absolute same-origin callbackURL", () => {
    expect(
      resolveOAuthErrorKey(
        params(
          nested("https://app.example.test/?error=unable_to_link_account"),
        ),
        origin,
      ),
    ).toBe("unableToLinkAccount")
  })

  test("reads the code from a relative callbackURL", () => {
    expect(
      resolveOAuthErrorKey(params(nested("/?error=access_denied")), origin),
    ).toBe("accessDenied")
  })

  test("a direct error wins over a nested one", () => {
    expect(
      resolveOAuthErrorKey(
        params(`error=state_mismatch&${nested("/?error=access_denied")}`),
        origin,
      ),
    ).toBe("sessionExpired")
  })

  test.each([
    "state_mismatch",
    "state_not_found",
    "state_invalid",
  ])("maps %s to sessionExpired", (code) => {
    expect(resolveOAuthErrorKey(params(`error=${code}`), origin)).toBe(
      "sessionExpired",
    )
  })

  test.each([
    "<script>",
    "constructor",
    "__proto__",
    "toString",
    "hasOwnProperty",
  ])("maps unknown or prototype-named code %s to generic", (code) => {
    expect(
      resolveOAuthErrorKey(params(`error=${encodeURIComponent(code)}`), origin),
    ).toBe("generic")
  })

  test("ignores a callbackURL on a foreign origin", () => {
    expect(
      resolveOAuthErrorKey(
        params(nested("https://evil.example/?error=account_not_linked")),
        origin,
      ),
    ).toBeNull()
  })

  test("ignores a malformed callbackURL", () => {
    expect(resolveOAuthErrorKey(params("callbackURL=%ZZ%"), origin)).toBeNull()
    expect(
      resolveOAuthErrorKey(params(nested("http://[bad")), origin),
    ).toBeNull()
  })

  test("returns null when there is no error", () => {
    expect(resolveOAuthErrorKey(params(nested("/space/1")), origin)).toBeNull()
    expect(resolveOAuthErrorKey(params(""), origin)).toBeNull()
  })

  test("every key has a full translation key", () => {
    expect(Object.keys(OAUTH_ERROR_MESSAGE_KEYS).sort()).toEqual([
      "accessDenied",
      "accountNotLinked",
      "generic",
      "sessionExpired",
      "unableToLinkAccount",
    ])
    for (const value of Object.values(OAUTH_ERROR_MESSAGE_KEYS)) {
      expect(value).toMatch(TRANSLATION_KEY_PATTERN)
    }
  })
})

describe("withoutOAuthError", () => {
  const page = "/auth/sign-in"

  test("drops a direct ?error= and keeps every other param", () => {
    expect(
      withoutOAuthError(`${page}?error=state_mismatch&plan=pro`, origin),
    ).toBe(`${page}?plan=pro`)
  })

  test("drops the error nested in callbackURL but keeps the callbackURL itself", () => {
    const result = withoutOAuthError(
      `${page}?${nested("https://app.example.test/space/1?error=state_mismatch&tab=a")}`,
      origin,
    )
    expect(result).not.toBeNull()
    const callbackURL = new URL(result as string, origin).searchParams.get(
      "callbackURL",
    )
    expect(callbackURL).toBe("https://app.example.test/space/1?tab=a")
  })

  test("keeps a relative callbackURL relative", () => {
    const result = withoutOAuthError(
      `${page}?${nested("/space/1?error=state_mismatch")}`,
      origin,
    )
    expect(
      new URL(result as string, origin).searchParams.get("callbackURL"),
    ).toBe("/space/1")
  })

  test("returns null when there is nothing to drop", () => {
    expect(withoutOAuthError(`${page}?plan=pro`, origin)).toBeNull()
    expect(
      withoutOAuthError(`${page}?${nested("/space/1?tab=a")}`, origin),
    ).toBeNull()
  })

  test("leaves a cross-origin callbackURL untouched", () => {
    expect(
      withoutOAuthError(
        `${page}?${nested("https://evil.test/?error=state_mismatch")}`,
        origin,
      ),
    ).toBeNull()
  })
})
