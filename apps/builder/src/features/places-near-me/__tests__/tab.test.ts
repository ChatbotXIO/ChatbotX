import { describe, expect, test } from "vitest"
import { buildTabSearchParams, parsePlacesNearMeTab } from "../lib/tab"

describe("parsePlacesNearMeTab", () => {
  test("defaults to locations", () => {
    expect(parsePlacesNearMeTab(undefined)).toBe("locations")
  })
  test("accepts categories", () => {
    expect(parsePlacesNearMeTab("categories")).toBe("categories")
  })
  test("uses the first array value", () => {
    expect(parsePlacesNearMeTab(["categories", "x"])).toBe("categories")
  })
  test("falls back to locations for unknown values", () => {
    expect(parsePlacesNearMeTab("bogus")).toBe("locations")
  })
})

describe("buildTabSearchParams", () => {
  test("switching to locations clears tab and tab-state keys", () => {
    expect(
      buildTabSearchParams(
        "tab=categories&page=3&name=a",
        "locations",
      ).toString(),
    ).toBe("")
  })
  test("switching to categories sets tab and drops page, perPage, name", () => {
    expect(
      buildTabSearchParams("page=2&perPage=20&name=a", "categories").toString(),
    ).toBe("tab=categories")
  })
})
