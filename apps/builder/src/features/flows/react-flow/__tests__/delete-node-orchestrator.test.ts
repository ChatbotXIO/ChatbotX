import { describe, expect, test, vi } from "vitest"
import {
  createDeleteNode,
  type DeleteNodeDeps,
} from "../delete-node-orchestrator"

function makeDeps(
  overrides: Partial<DeleteNodeDeps> = {},
): DeleteNodeDeps & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    isMutatingRef: { current: false },
    setIsFlowMutating: (v: boolean) => calls.push(`setIsFlowMutating:${v}`),
    cancelAutosave: () => calls.push("cancelAutosave"),
    deleteElements: () => {
      calls.push("deleteElements")
      return Promise.resolve({ deletedNodes: [], deletedEdges: [] })
    },
    getNodes: () => [],
    getEdges: () => [],
    saveDraft: () => {
      calls.push("saveDraft")
      return Promise.resolve({ data: { ok: true } })
    },
    onError: () => calls.push("onError"),
    ...overrides,
  }
}

describe("createDeleteNode", () => {
  test("locks, deletes, persists the settled state, then unlocks", async () => {
    const deps = makeDeps()
    await createDeleteNode(deps)("node-1")

    expect(deps.calls).toEqual([
      "setIsFlowMutating:true",
      "cancelAutosave",
      "deleteElements",
      "saveDraft",
      "setIsFlowMutating:false",
    ])
    expect(deps.isMutatingRef.current).toBe(false)
  })

  test("deletes exactly the requested node id", async () => {
    const deleteElements = vi.fn(() => Promise.resolve({}))
    const deps = makeDeps({ deleteElements })
    await createDeleteNode(deps)("node-42")
    expect(deleteElements).toHaveBeenCalledWith({ nodes: [{ id: "node-42" }] })
  })

  test("cancels the pending autosave before deleting", async () => {
    const deps = makeDeps()
    await createDeleteNode(deps)("node-1")
    expect(deps.calls.indexOf("cancelAutosave")).toBeLessThan(
      deps.calls.indexOf("deleteElements"),
    )
  })

  test("persists AFTER the delete has applied (settled canvas)", async () => {
    const deps = makeDeps()
    await createDeleteNode(deps)("node-1")
    expect(deps.calls.indexOf("deleteElements")).toBeLessThan(
      deps.calls.indexOf("saveDraft"),
    )
  })

  test("toasts when the save resolves with a serverError", async () => {
    const deps = makeDeps({
      saveDraft: () => Promise.resolve({ serverError: "boom" }),
    })
    await createDeleteNode(deps)("node-1")
    expect(deps.calls).toContain("onError")
    expect(deps.isMutatingRef.current).toBe(false)
  })

  test("toasts when the save resolves with the idle shape {}", async () => {
    const deps = makeDeps({ saveDraft: () => Promise.resolve({}) })
    await createDeleteNode(deps)("node-1")
    expect(deps.calls).toContain("onError")
  })

  test("toasts when the save rejects (network)", async () => {
    const deps = makeDeps({
      saveDraft: () => Promise.reject(new Error("network")),
    })
    await createDeleteNode(deps)("node-1")
    expect(deps.calls).toContain("onError")
    expect(deps.isMutatingRef.current).toBe(false)
  })

  test("does not toast on success", async () => {
    const deps = makeDeps()
    await createDeleteNode(deps)("node-1")
    expect(deps.calls).not.toContain("onError")
  })

  test("ignores a re-entrant call while already mutating", async () => {
    const deps = makeDeps({ isMutatingRef: { current: true } })
    await createDeleteNode(deps)("node-1")
    expect(deps.calls).toEqual([])
  })
})
