import type { Edge, Node } from "@xyflow/react"
import { describe, expect, test } from "vitest"
import { createFlowHistoryStore } from "../flow-history-store"

const node = (
  id: string,
  label = id,
  extraData: Record<string, unknown> = {},
) =>
  ({
    id,
    data: { label, ...extraData },
    position: { x: 0, y: 0 },
  }) as Node

const edge = (id: string) =>
  ({
    id,
    source: "source",
    target: "target",
  }) as Edge

describe("createFlowHistoryStore", () => {
  test("moves the current canvas state to future when undoing", () => {
    const store = createFlowHistoryStore()
    const previous = { nodes: [node("previous")], edges: [edge("previous")] }
    const current = { nodes: [node("current")], edges: [edge("current")] }

    store.getState().takeSnapshot(previous.nodes, previous.edges)

    expect(store.getState().undo(current)).toEqual(previous)
    expect(store.getState().past).toEqual([])
    expect(store.getState().future).toEqual([current])
  })

  test("restores redo snapshots in the order they were undone", () => {
    const store = createFlowHistoryStore()
    const first = { nodes: [node("first")], edges: [] }
    const second = { nodes: [node("second")], edges: [] }
    const third = { nodes: [node("third")], edges: [] }

    store.getState().takeSnapshot(first.nodes, first.edges)
    store.getState().takeSnapshot(second.nodes, second.edges)

    expect(store.getState().undo(third)).toEqual(second)
    expect(store.getState().undo(second)).toEqual(first)
    expect(store.getState().redo(first)).toEqual(second)
    expect(store.getState().redo(second)).toEqual(third)
  })

  test("clears redo history when taking a new snapshot", () => {
    const store = createFlowHistoryStore()
    const first = { nodes: [node("first")], edges: [] }
    const second = { nodes: [node("second")], edges: [] }
    const third = { nodes: [node("third")], edges: [] }

    store.getState().takeSnapshot(first.nodes, first.edges)
    store.getState().undo(second)
    store.getState().takeSnapshot(third.nodes, third.edges)

    expect(store.getState().future).toEqual([])
    expect(store.getState().redo(third)).toBeNull()
    expect(store.getState().branchClearedCount).toBe(1)
  })

  test("does not mark a branch clear when no redo history exists", () => {
    const store = createFlowHistoryStore()
    store.getState().takeSnapshot([node("first")], [])

    expect(store.getState().branchClearedCount).toBe(0)
  })

  test("reset clears both history stacks without touching restore handlers", () => {
    const store = createFlowHistoryStore()
    store.getState().setRestoreHandlers({
      setNodes: () => {
        // no-op
      },
      setEdges: () => {
        // no-op
      },
    })

    store.getState().takeSnapshot([node("first")], [])
    store.getState().undo({ nodes: [node("current")], edges: [] })
    store.getState().reset()

    expect(store.getState().past).toEqual([])
    expect(store.getState().future).toEqual([])
    expect(store.getState().restoreHandlers).not.toBeNull()
  })

  test("clones snapshots so later live mutations do not change history", () => {
    const store = createFlowHistoryStore()
    const liveNodes = [node("live", "before")]
    const liveEdges = [edge("live")]

    store.getState().takeSnapshot(liveNodes, liveEdges)
    liveNodes[0].data = { label: "after" }
    liveEdges[0].target = "changed"

    expect(
      store.getState().undo({ nodes: [node("current")], edges: [] }),
    ).toEqual({
      nodes: [node("live", "before")],
      edges: [edge("live")],
    })
  })

  test("caps past history at fifty snapshots", () => {
    const store = createFlowHistoryStore()

    for (let index = 0; index < 51; index += 1) {
      store.getState().takeSnapshot([node(`node-${index}`)], [])
    }

    expect(store.getState().past).toHaveLength(50)
    expect(store.getState().past[0].nodes[0].id).toBe("node-1")
  })

  test("evicts oldest snapshots when the byte budget is exceeded", () => {
    const store = createFlowHistoryStore()
    const payload = "x".repeat(1024 * 1024)

    for (let index = 0; index < 6; index += 1) {
      store
        .getState()
        .takeSnapshot(
          [node(`large-${index}`, `large-${index}`, { payload })],
          [],
        )
    }

    expect(store.getState().past).toHaveLength(5)
    expect(store.getState().past[0].nodes[0].id).toBe("large-1")
  })

  test("returns null and leaves stacks untouched when there is nothing to undo or redo", () => {
    const store = createFlowHistoryStore()
    const current = { nodes: [node("current")], edges: [] }

    expect(store.getState().undo(current)).toBeNull()
    expect(store.getState().redo(current)).toBeNull()
    expect(store.getState().past).toEqual([])
    expect(store.getState().future).toEqual([])
  })

  test("applies restored snapshots through the registered handlers", () => {
    const store = createFlowHistoryStore()
    const appliedNodes: Node[][] = []
    store.getState().setRestoreHandlers({
      setNodes: (nodes) => appliedNodes.push(nodes),
      setEdges: () => {
        // edges asserted via nodes; ignore here
      },
    })

    const first = { nodes: [node("first")], edges: [] }
    const second = { nodes: [node("second")], edges: [] }

    store.getState().takeSnapshot(first.nodes, first.edges)
    store.getState().undo(second)
    store.getState().redo(first)

    // undo restores `first`, redo restores `second` (the state undo shelved).
    expect(appliedNodes[0]).toEqual(first.nodes)
    expect(appliedNodes[1]).toEqual(second.nodes)
  })

  test("does not throw when restoring without registered handlers", () => {
    const store = createFlowHistoryStore()
    store.getState().takeSnapshot([node("first")], [])

    expect(() =>
      store.getState().undo({ nodes: [node("current")], edges: [] }),
    ).not.toThrow()
  })
})
