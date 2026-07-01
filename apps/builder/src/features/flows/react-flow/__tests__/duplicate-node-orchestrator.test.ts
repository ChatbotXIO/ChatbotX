import type { FlowNode } from "@chatbotx.io/flow-config"
import { describe, expect, test, vi } from "vitest"
import {
  createDuplicateNode,
  type DuplicateNodeDeps,
  type DuplicateSaveResult,
} from "../duplicate-node-orchestrator"

const node = (id: string) => ({ id }) as unknown as FlowNode

function makeDeps(
  overrides: Partial<DuplicateNodeDeps> = {},
): DuplicateNodeDeps & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    isMutatingRef: { current: false },
    setIsFlowMutating: (v: boolean) => calls.push(`setIsFlowMutating:${v}`),
    cancelAutosave: () => calls.push("cancelAutosave"),
    getNodes: () => [node("existing")],
    getEdges: () => [],
    cloneNode: () => {
      calls.push("cloneNode")
      return node("clone")
    },
    addNodes: () => calls.push("addNodes"),
    saveDraft: () => {
      calls.push("saveDraft")
      return Promise.resolve({ data: { ok: true } })
    },
    onError: () => calls.push("onError"),
    ...overrides,
  }
}

describe("createDuplicateNode", () => {
  test("reveals the clone after a durable save and unlocks", async () => {
    const deps = makeDeps()
    await createDuplicateNode(deps)(node("src"))

    expect(deps.calls).toEqual([
      "setIsFlowMutating:true",
      "cancelAutosave",
      "cloneNode",
      "saveDraft",
      "addNodes",
      "setIsFlowMutating:false",
    ])
    expect(deps.isMutatingRef.current).toBe(false)
  })

  test("cancels the pending autosave before saving", async () => {
    const deps = makeDeps()
    await createDuplicateNode(deps)(node("src"))
    expect(deps.calls.indexOf("cancelAutosave")).toBeLessThan(
      deps.calls.indexOf("saveDraft"),
    )
  })

  test("saves the existing nodes plus the clone", async () => {
    const saveDraft = vi.fn(async () => ({ data: { ok: true } }))
    const deps = makeDeps({
      getNodes: () => [node("a"), node("b")],
      cloneNode: () => node("clone"),
      saveDraft,
    })
    await createDuplicateNode(deps)(node("src"))

    expect(saveDraft).toHaveBeenCalledWith({
      nodes: [node("a"), node("b"), node("clone")],
      edges: [],
    })
  })

  test("does not reveal when the save resolves with a serverError", async () => {
    const deps = makeDeps({ saveDraft: async () => ({ serverError: "boom" }) })
    await createDuplicateNode(deps)(node("src"))

    expect(deps.calls).not.toContain("addNodes")
    expect(deps.calls).toContain("onError")
    expect(deps.calls).toContain("setIsFlowMutating:false")
    expect(deps.isMutatingRef.current).toBe(false)
  })

  test("does not reveal when the save resolves with the idle shape {}", async () => {
    const deps = makeDeps({ saveDraft: async () => ({}) })
    await createDuplicateNode(deps)(node("src"))

    expect(deps.calls).not.toContain("addNodes")
    expect(deps.calls).toContain("onError")
  })

  test("does not reveal when the save rejects (network)", async () => {
    const deps = makeDeps({
      saveDraft: () => Promise.reject(new Error("network")),
    })
    await createDuplicateNode(deps)(node("src"))

    expect(deps.calls).not.toContain("addNodes")
    expect(deps.calls).toContain("onError")
    expect(deps.isMutatingRef.current).toBe(false)
  })

  test("ignores a re-entrant call while already mutating", async () => {
    const deps = makeDeps({ isMutatingRef: { current: true } })
    await createDuplicateNode(deps)(node("src"))

    expect(deps.calls).toEqual([])
  })

  test("does not reveal until the save resolves (persist-first)", async () => {
    let resolve: (r: DuplicateSaveResult) => void = () => {
      // assigned synchronously below
    }
    const pending = new Promise<DuplicateSaveResult>((r) => {
      resolve = r
    })
    const deps = makeDeps({ saveDraft: () => pending })

    const run = createDuplicateNode(deps)(node("src"))
    await Promise.resolve()
    expect(deps.calls).not.toContain("addNodes")

    resolve({ data: { ok: true } })
    await run
    expect(deps.calls).toContain("addNodes")
  })
})
