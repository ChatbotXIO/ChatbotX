import { describe, expect, test } from "vitest"
import { getFlowStructureSignature } from "../flow-structure-signature"

describe("getFlowStructureSignature", () => {
  test("is identical when only node order changes (drag/reorder stays debounced)", () => {
    const a = getFlowStructureSignature([{ id: "1" }, { id: "2" }], [])
    const b = getFlowStructureSignature([{ id: "2" }, { id: "1" }], [])

    expect(a).toBe(b)
  })

  test("changes when a node is added (duplicate)", () => {
    const before = getFlowStructureSignature([{ id: "1" }], [])
    const after = getFlowStructureSignature([{ id: "1" }, { id: "2" }], [])

    expect(after).not.toBe(before)
  })

  test("changes when a node is removed (delete)", () => {
    const before = getFlowStructureSignature([{ id: "1" }, { id: "2" }], [])
    const after = getFlowStructureSignature([{ id: "1" }], [])

    expect(after).not.toBe(before)
  })

  test("changes when an edge is added or removed", () => {
    const before = getFlowStructureSignature([{ id: "1" }], [])
    const after = getFlowStructureSignature([{ id: "1" }], [{ id: "e1" }])

    expect(after).not.toBe(before)
  })
})
