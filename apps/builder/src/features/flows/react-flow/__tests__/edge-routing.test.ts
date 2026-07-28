import type { Edge } from "@xyflow/react"
import { describe, expect, test } from "vitest"
import {
  getRoutableHandleId,
  replaceSourceHandleEdge,
  toRouteRemovals,
} from "../edge-routing"

const makeEdge = (
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
): Edge => ({
  id,
  source,
  sourceHandle,
  target,
  targetHandle: target,
})

describe("replaceSourceHandleEdge", () => {
  test("replaces only the edge owned by the same source and handle", () => {
    const replaced = makeEdge("old", "source-1", "button-1", "target-1")
    const otherHandle = makeEdge(
      "other-handle",
      "source-1",
      "button-2",
      "target-2",
    )
    const duplicateHandleOnAnotherNode = makeEdge(
      "other-node",
      "source-2",
      "button-1",
      "target-3",
    )

    const result = replaceSourceHandleEdge(
      [replaced, otherHandle, duplicateHandleOnAnotherNode],
      {
        source: "source-1",
        sourceHandle: "button-1",
        target: "target-4",
        targetHandle: "target-4",
        type: "buttonedge",
      },
    )

    expect(result).toHaveLength(3)
    expect(result).not.toContain(replaced)
    expect(result).toContain(otherHandle)
    expect(result).toContain(duplicateHandleOnAnotherNode)
    expect(result).toContainEqual(
      expect.objectContaining({
        source: "source-1",
        sourceHandle: "button-1",
        target: "target-4",
      }),
    )
  })

  test("does not duplicate an identical connection", () => {
    const existing = makeEdge("existing", "source", "button", "target")
    const edges = [existing]

    const result = replaceSourceHandleEdge(edges, {
      source: "source",
      sourceHandle: "button",
      target: "target",
      targetHandle: "target",
      type: "buttonedge",
    })

    expect(result).toHaveLength(1)
    expect(result).toBe(edges)
    expect(result[0].id).toBe("existing")
    expect(result[0]).toMatchObject({
      source: "source",
      sourceHandle: "button",
      target: "target",
    })
  })
})

describe("getRoutableHandleId", () => {
  test("accepts a button handle and rejects the node's own continue handle", () => {
    expect(getRoutableHandleId("node-1", "button-1")).toBe("button-1")
    expect(getRoutableHandleId("node-1", "node-1")).toBeNull()
  })

  test("rejects a missing or empty handle id", () => {
    expect(getRoutableHandleId("node-1", null)).toBeNull()
    expect(getRoutableHandleId("node-1", undefined)).toBeNull()
    expect(getRoutableHandleId("node-1", "")).toBeNull()
  })
})

describe("toRouteRemovals", () => {
  test("clears every button route and skips continue handles", () => {
    const buttonEdge = makeEdge("edge-1", "source-1", "button-1", "target-1")
    const continueEdge = makeEdge("edge-2", "source-2", "source-2", "target-2")
    const handlelessEdge: Edge = {
      id: "edge-3",
      source: "source-3",
      target: "target-3",
    }

    expect(toRouteRemovals([buttonEdge, continueEdge, handlelessEdge])).toEqual(
      [{ sourceNodeId: "source-1", handleId: "button-1", route: null }],
    )
  })

  test("keeps one removal per deleted edge, scoped to its own source node", () => {
    const removals = toRouteRemovals([
      makeEdge("edge-1", "source-1", "shared-id", "target-1"),
      makeEdge("edge-2", "source-2", "shared-id", "target-2"),
    ])

    expect(removals).toEqual([
      { sourceNodeId: "source-1", handleId: "shared-id", route: null },
      { sourceNodeId: "source-2", handleId: "shared-id", route: null },
    ])
  })

  test("returns nothing when no edge owns a route", () => {
    expect(toRouteRemovals([])).toEqual([])
  })
})
