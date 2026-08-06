import type { Node } from "@xyflow/react"
import { describe, expect, test, vi } from "vitest"
import { findNodeAtPoint } from "../node-hit-test"

const makeNode = (id: string, zIndex?: number): Node =>
  ({
    id,
    position: { x: 0, y: 0 },
    data: {},
    zIndex,
  }) as Node

describe("findNodeAtPoint", () => {
  test("queries a 1x1 rect at the point with partially=false", () => {
    const getIntersectingNodes = vi.fn().mockReturnValue([])

    findNodeAtPoint(getIntersectingNodes, { x: 12, y: 34 }, "excluded")

    expect(getIntersectingNodes).toHaveBeenCalledWith(
      { x: 12, y: 34, width: 1, height: 1 },
      false,
    )
  })

  test("returns undefined when nothing intersects the point", () => {
    const getIntersectingNodes = vi.fn().mockReturnValue([])

    expect(
      findNodeAtPoint(getIntersectingNodes, { x: 0, y: 0 }, "excluded"),
    ).toBeUndefined()
  })

  test("excludes the given node id even if it intersects", () => {
    const self = makeNode("self")
    const getIntersectingNodes = vi.fn().mockReturnValue([self])

    expect(
      findNodeAtPoint(getIntersectingNodes, { x: 0, y: 0 }, "self"),
    ).toBeUndefined()
  })

  test("prefers the candidate with the highest zIndex", () => {
    const low = makeNode("low", 1)
    const high = makeNode("high", 5)
    const getIntersectingNodes = vi.fn().mockReturnValue([high, low])

    const result = findNodeAtPoint(
      getIntersectingNodes,
      { x: 0, y: 0 },
      "excluded",
    )

    expect(result?.id).toBe("high")
  })

  test("breaks ties between equal (or unset) zIndex by preferring the last candidate", () => {
    const first = makeNode("first")
    const second = makeNode("second")
    const getIntersectingNodes = vi.fn().mockReturnValue([first, second])

    const result = findNodeAtPoint(
      getIntersectingNodes,
      { x: 0, y: 0 },
      "excluded",
    )

    expect(result?.id).toBe("second")
  })
})
