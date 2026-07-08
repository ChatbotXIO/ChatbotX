import { describe, expect, test } from "vitest"
import { hasMeaningfulNodeChange } from "../react-flow-node-change"

describe("hasMeaningfulNodeChange", () => {
  test("ignores measurement and programmatic position changes", () => {
    const changes = [
      { type: "dimensions", id: "node-1" },
      { type: "position", id: "node-2" },
    ] as any[]

    expect(hasMeaningfulNodeChange(changes)).toBe(false)
  })

  test("treats add and remove as meaningful changes", () => {
    expect(
      hasMeaningfulNodeChange([{ type: "add", item: { id: "node-1" } } as any]),
    ).toBe(true)
    expect(
      hasMeaningfulNodeChange([{ type: "remove", id: "node-1" } as any]),
    ).toBe(true)
  })
})
