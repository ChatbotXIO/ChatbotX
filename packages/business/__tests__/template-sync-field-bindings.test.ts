// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/database/client", () => ({ inArray: vi.fn() }))
vi.mock("@chatbotx.io/database/schema", () => ({
  customFieldModel: { id: "id", name: "name" },
}))

const { durableFieldNameBindings } = await import(
  "../src/template/sync-field-bindings"
)

const txReturning = (rows: { id: string; name: string }[]) =>
  ({
    select: () => ({ from: () => ({ where: () => Promise.resolve(rows) }) }),
  }) as never

describe("durableFieldNameBindings", () => {
  test("keeps following a copy under its other name", async () => {
    const bindings = await durableFieldNameBindings(
      txReturning([{ id: "t1", name: "size_1" }]),
      { s1: { name: "size", type: "number" } },
      new Map([["s1", "t1"]]),
    )

    expect([...bindings]).toEqual([["size", "size_1"]])
  })

  test("a name two source fields share stays unbound, as on an install", async () => {
    const bindings = await durableFieldNameBindings(
      txReturning([
        { id: "t1", name: "size" },
        { id: "t2", name: "size_1" },
      ]),
      {
        s1: { name: "size", type: "shortText" },
        s2: { name: "size", type: "number" },
      },
      new Map([
        ["s1", "t1"],
        ["s2", "t2"],
      ]),
    )

    expect(bindings.size).toBe(0)
  })
})
