import { describe, expect, test } from "vitest"
import { resourceHref } from "@/features/templates/lib/resource-href"

describe("resourceHref", () => {
  test.each([
    ["flows", "/space/7/flows/9"],
    ["calendars", "/space/7/appointment-calendars/9/edit"],
    ["webchats", "/space/7/webchats/9/edit"],
    ["products", "/space/7/products/9/edit"],
    ["sequences", "/space/7/sequences/9"],
    ["questionnaires", "/space/7/questionnaires/9/edit"],
  ])("opens a %s copy at its own page", (category, href) => {
    expect(resourceHref("7", category, "9")).toBe(href)
  })

  test("returns null for a category with no page of its own", () => {
    expect(resourceHref("7", "tags", "9")).toBeNull()
  })

  test("does not resolve inherited object keys as categories", () => {
    expect(resourceHref("7", "constructor", "9")).toBeNull()
    expect(resourceHref("7", "toString", "9")).toBeNull()
  })
})
