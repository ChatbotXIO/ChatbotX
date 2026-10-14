import { listJsonPathEntries } from "@chatbotx.io/utils/json-path"
import { describe, expect, test } from "vitest"
import { filterJsonPathEntries } from "../src/features/inbound-webhooks/components/json-path-picker-dialog"

const { entries } = listJsonPathEntries({
  customer: { email: "Ann@Example.com", "first-name": "Ann", tags: ["vip"] },
  total: 12,
})

const pathsOf = (query: string) =>
  filterJsonPathEntries(entries, query).map(({ path }) => path)

describe("filterJsonPathEntries", () => {
  test("matches a key, case-insensitively", () => {
    expect(pathsOf("EMAIL")).toEqual(["$.customer.email"])
  })

  test("matches a value", () => {
    expect(pathsOf("ann@example")).toEqual(["$.customer.email"])
    expect(pathsOf("vip")).toEqual(["$.customer.tags[0]"])
  })

  test("matches inside a path that needs brackets", () => {
    expect(pathsOf("first-name")).toEqual(['$.customer["first-name"]'])
  })

  test("never offers the root, however the query matches it", () => {
    expect(pathsOf("$")).not.toContain("$")
  })

  test("returns nothing for text that is nowhere in the payload", () => {
    expect(pathsOf("zzz")).toEqual([])
  })

  test("matches a number's text", () => {
    expect(pathsOf("12")).toEqual(["$.total"])
  })
})
