import { describe, expect, test } from "vitest"
import {
  authorizeScopesFor,
  hasRequiredScopes,
  methodOfGrant,
  missingRequiredScopes,
  parseUploadMethod,
  requiredScopesFor,
  uploadMethodOf,
} from "../src/lib/scopes"

const ADS = "https://www.googleapis.com/auth/adwords"
const DM = "https://www.googleapis.com/auth/datamanager"

describe("requiredScopesFor", () => {
  test("Data Manager needs adwords and datamanager", () => {
    expect(requiredScopesFor("dataManager")).toEqual([ADS, DM])
  })

  test("legacy needs adwords only", () => {
    expect(requiredScopesFor("legacy")).toEqual([ADS])
  })

  test("the authorize scopes keep openid and email", () => {
    expect(authorizeScopesFor("dataManager")).toEqual([
      ADS,
      DM,
      "openid",
      "email",
    ])
    expect(authorizeScopesFor("legacy")).toEqual([ADS, "openid", "email"])
  })
})

describe("missingRequiredScopes", () => {
  test("defaults to Data Manager", () => {
    expect(missingRequiredScopes([ADS])).toEqual([DM])
  })

  test("legacy is satisfied by adwords alone", () => {
    expect(missingRequiredScopes([ADS], "legacy")).toEqual([])
    expect(missingRequiredScopes([], "legacy")).toEqual([ADS])
  })
})

describe("uploadMethodOf / parseUploadMethod", () => {
  test.each([
    [undefined, "dataManager"],
    [null, "dataManager"],
    ["soap", "dataManager"],
    ["dataManager", "dataManager"],
    ["legacy", "legacy"],
  ])("parses %s as %s", (value, expected) => {
    expect(parseUploadMethod(value)).toBe(expected)
  })

  test("reads the method from auth metadata, defaulting to Data Manager", () => {
    expect(uploadMethodOf({ metadata: { uploadMethod: "legacy" } })).toBe(
      "legacy",
    )
    expect(uploadMethodOf({ metadata: {} })).toBe("dataManager")
    expect(uploadMethodOf({})).toBe("dataManager")
  })
})

describe("methodOfGrant", () => {
  test.each([
    ["dataManager", [ADS, DM], "dataManager"],
    ["dataManager", [ADS], "dataManager"],
    ["legacy", [ADS, DM], "dataManager"],
    ["legacy", [ADS], "legacy"],
  ] as const)("credential %s with grant %j is %s", (credential, granted, expected) => {
    expect(methodOfGrant(credential, granted)).toBe(expected)
  })
})

describe("hasRequiredScopes", () => {
  test("a row without a recorded scope predates the check and passes", () => {
    expect(hasRequiredScopes({ metadata: {} })).toBe(true)
  })

  test("is judged by the connection's own method", () => {
    const adsOnly = `${ADS} openid email`
    expect(hasRequiredScopes({ metadata: { scope: adsOnly } })).toBe(false)
    expect(
      hasRequiredScopes({
        metadata: { scope: adsOnly, uploadMethod: "legacy" },
      }),
    ).toBe(true)
  })
})
