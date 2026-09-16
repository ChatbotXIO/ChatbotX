import { describe, expect, test } from "vitest"
import { FlowAuthoringException } from "../../src/authoring/errors"
import { normalizeAuthoredGraph } from "../../src/authoring/normalize-graph"
import { DEFAULT_NODE_MEASURED } from "../../src/nodes/base"

const COLUMN_WIDTH = DEFAULT_NODE_MEASURED.width + 120

describe("normalizeAuthoredGraph", () => {
  test("lays out a chain with no positions like the compiler would", () => {
    const result = normalizeAuthoredGraph(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
      ],
    )

    // Node order is preserved, so index still tracks the authored a/b/c order
    // even though the returned ids are freshly generated, not "a"/"b"/"c".
    const [nodeA, nodeB, nodeC] = result.nodes

    expect(nodeA.position).toEqual({ x: 100, y: 100 })
    expect(nodeB.position).toEqual({ x: 100 + COLUMN_WIDTH, y: 100 })
    expect(nodeC.position).toEqual({ x: 100 + COLUMN_WIDTH * 2, y: 100 })
    for (const node of result.nodes) {
      expect(node.measured).toEqual(DEFAULT_NODE_MEASURED)
    }
  })

  test("keeps a caller-supplied position instead of laying it out", () => {
    const result = normalizeAuthoredGraph(
      [{ id: "a", position: { x: 42, y: 7 } }],
      [],
    )

    expect(result.nodes[0].position).toEqual({ x: 42, y: 7 })
  })

  test("remaps every authored node id to a fresh internal id", () => {
    const result = normalizeAuthoredGraph([{ id: "a" }, { id: "b" }], [])

    const ids = result.nodes.map((node) => node.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) {
      expect(id).not.toBe("a")
      expect(id).not.toBe("b")
    }
  })

  test("returns the authored id -> persisted id map for every node", () => {
    const result = normalizeAuthoredGraph([{ id: "a" }, { id: "b" }], [])

    expect(Object.keys(result.nodeIds).sort()).toEqual(["a", "b"])
    expect(result.nodeIds.a).toBe(result.nodes[0].id)
    expect(result.nodeIds.b).toBe(result.nodes[1].id)
  })

  test("generates edge ids and node-id handles, rewriting them to the remapped node ids", () => {
    const result = normalizeAuthoredGraph(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      [
        { source: "a", target: "b" },
        {
          id: "custom-edge",
          source: "b",
          sourceHandle: "yes",
          target: "c",
          targetHandle: "in",
        },
      ],
    )
    const [nodeA, nodeB, nodeC] = result.nodes

    const generated = result.edges.find((edge) => edge.source === nodeA.id)
    expect(generated?.id).toBeTruthy()
    expect(generated?.sourceHandle).toBe(nodeA.id)
    expect(generated?.target).toBe(nodeB.id)
    expect(generated?.targetHandle).toBe(nodeB.id)

    // A caller-supplied handle is an arbitrary handle name, not a node id —
    // it passes through untouched even though source/target are remapped.
    const supplied = result.edges.find((edge) => edge.id === "custom-edge")
    expect(supplied).toEqual({
      id: "custom-edge",
      source: nodeB.id,
      sourceHandle: "yes",
      target: nodeC.id,
      targetHandle: "in",
    })
  })

  test("start node falls back to the first node when none is flagged", () => {
    const result = normalizeAuthoredGraph([{ id: "a" }, { id: "b" }], [])

    expect(result.startNodeId).toBe(result.nodes[0].id)
  })

  test("start node uses the flagged node, and exactly one node stays flagged", () => {
    const result = normalizeAuthoredGraph(
      [
        { id: "a", data: { isStartNode: true } },
        { id: "b", data: { isStartNode: true } },
      ],
      [],
    )

    expect(result.startNodeId).toBe(result.nodes[0].id)
    const flaggedNodes = result.nodes.filter(
      (node) => node.data?.isStartNode === true,
    )
    expect(flaggedNodes).toHaveLength(1)
    expect(flaggedNodes[0].id).toBe(result.nodes[0].id)
  })

  test("collects a duplicate node id and an unknown edge target in one exception", () => {
    expect.assertions(3)
    try {
      normalizeAuthoredGraph(
        [{ id: "a" }, { id: "a" }],
        [{ source: "a", target: "missing" }],
      )
    } catch (error) {
      expect(error).toBeInstanceOf(FlowAuthoringException)
      const authoringError = error as FlowAuthoringException
      expect(authoringError.errors.map((issue) => issue.path)).toContain(
        "nodes[1].id",
      )
      expect(authoringError.errors.map((issue) => issue.path)).toContain(
        "edges[0].target",
      )
    }
  })
})
