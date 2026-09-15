import { describe, expect, test } from "vitest"
import { layoutNodes } from "../../src/authoring/layout"

const expectFinitePosition = (
  position: { x: number; y: number } | undefined,
) => {
  expect(position).toBeDefined()
  expect(Number.isFinite(position?.x)).toBe(true)
  expect(Number.isFinite(position?.y)).toBe(true)
}

describe("layoutNodes", () => {
  test("places an unreachable node in a fallback column", () => {
    const positions = layoutNodes(
      ["start", "reachable", "unreachable"],
      [{ source: "start", target: "reachable" }],
      "start",
    )
    const reachablePosition = positions.get("reachable")
    const unreachablePosition = positions.get("unreachable")

    expectFinitePosition(unreachablePosition)
    expect(unreachablePosition?.x).toBeGreaterThan(reachablePosition?.x ?? 0)
  })

  test("terminates on cycles and positions every node", () => {
    const nodeIds = ["start", "first", "second"]
    const positions = layoutNodes(
      nodeIds,
      [
        { source: "start", target: "first" },
        { source: "first", target: "second" },
        { source: "second", target: "first" },
      ],
      "start",
    )

    expect(positions).toHaveLength(nodeIds.length)
    for (const nodeId of nodeIds) {
      expectFinitePosition(positions.get(nodeId))
    }
  })
})
