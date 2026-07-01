import type { FlowNode } from "@chatbotx.io/flow-config"
import type { Edge } from "@xyflow/react"

/**
 * Minimal shape of a next-safe-action `executeAsync` result we depend on. Success
 * is signalled positively by `data.ok === true`; everything else (serverError, the
 * idle `{}` captured-throw shape, or a rejected promise -> `undefined`) is failure.
 */
export type DuplicateSaveResult =
  | {
      data?: { ok?: boolean } | undefined
      serverError?: unknown
      validationErrors?: unknown
    }
  | undefined

export type DuplicateNodeDeps = {
  /** Re-entrancy guard backed by a ref so rapid clicks can't race a stale closure. */
  isMutatingRef: { current: boolean }
  setIsFlowMutating: (value: boolean) => void
  /** Cancels the pending autosave debounce so it cannot clobber the manual save. */
  cancelAutosave: () => void
  getNodes: () => FlowNode[]
  getEdges: () => Edge[]
  cloneNode: (node: FlowNode) => FlowNode
  addNodes: (nodes: FlowNode[]) => void
  saveDraft: (input: {
    nodes: FlowNode[]
    edges: Edge[]
  }) => Promise<DuplicateSaveResult>
  /** Invoked when the save did not durably succeed (e.g. show an error toast). */
  onError: () => void
}

/**
 * Persist-first node duplication. The clone is revealed on the canvas ONLY after the
 * draft save durably confirms (`result.data.ok === true`), so a refresh mid-save can
 * never lose it. On any failure the canvas is left unchanged and unlocked.
 */
export function createDuplicateNode(deps: DuplicateNodeDeps) {
  return async (sourceNode: FlowNode): Promise<void> => {
    if (deps.isMutatingRef.current) {
      return
    }
    deps.isMutatingRef.current = true
    deps.setIsFlowMutating(true)
    deps.cancelAutosave()

    const clone = deps.cloneNode(sourceNode)
    const nextNodes = [...deps.getNodes(), clone]
    const nextEdges = deps.getEdges()

    let result: DuplicateSaveResult
    try {
      result = await deps.saveDraft({ nodes: nextNodes, edges: nextEdges })
    } catch {
      result = undefined
    }

    if (result?.data?.ok !== true) {
      deps.onError()
      deps.setIsFlowMutating(false)
      deps.isMutatingRef.current = false
      return
    }

    deps.addNodes([clone])
    deps.setIsFlowMutating(false)
    deps.isMutatingRef.current = false
  }
}
