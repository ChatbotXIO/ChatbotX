import { describe, expect, test } from "vitest"
import { paginateInMemory } from "@/lib/public-api/list"

// `paginateInMemory` is a temporary in-memory pagination helper shared by
// several public routes (see its doc comment in `lib/public-api/list.ts`).
// These pin its current, slightly asymmetric edge-case behavior so a future
// change to it is a deliberate decision, not a silent regression.
describe("paginateInMemory", () => {
  test("an empty list returns an empty page with pageCount 1, not 0", () => {
    const result = paginateInMemory([], { page: 1, perPage: 10 })

    expect(result).toEqual({ data: [], pageCount: 1 })
  })

  test("a page beyond the last page returns an empty data array but the real pageCount", () => {
    const items = [1, 2, 3]

    const result = paginateInMemory(items, { page: 5, perPage: 2 })

    expect(result).toEqual({ data: [], pageCount: 2 })
  })

  test("slices items for a page in range", () => {
    const items = [1, 2, 3, 4, 5]

    const result = paginateInMemory(items, { page: 2, perPage: 2 })

    expect(result).toEqual({ data: [3, 4], pageCount: 3 })
  })
})
