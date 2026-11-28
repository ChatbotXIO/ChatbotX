import { describe, expect, test } from "vitest"
import { dedupeBy } from "@/lib/dedupe-by"

describe("dedupeBy", () => {
  test("keeps the first item of each key, in order", () => {
    const items = [
      { id: "a", n: 1 },
      { id: "b", n: 2 },
      { id: "a", n: 3 },
    ]

    expect(dedupeBy(items, (item) => item.id)).toEqual([
      { id: "a", n: 1 },
      { id: "b", n: 2 },
    ])
  })

  test("returns an empty list for no items", () => {
    expect(dedupeBy([], String)).toEqual([])
  })
})
