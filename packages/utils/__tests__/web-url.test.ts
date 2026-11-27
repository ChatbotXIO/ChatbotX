import { describe, expect, test } from "vitest"
import { joinAppUrl } from "../src/web-url"

describe("joinAppUrl", () => {
  test.each([
    ["https://app.test", "https://app.test/shop/1"],
    ["https://app.test/", "https://app.test/shop/1"],
    ["https://app.test///", "https://app.test/shop/1"],
  ])("%s joins with exactly one slash", (appUrl, expected) => {
    expect(joinAppUrl(appUrl, "/shop/1")).toBe(expected)
  })
})
