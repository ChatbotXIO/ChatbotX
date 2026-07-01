import type { FlowNode } from "@chatbotx.io/flow-config"
import type { Edge } from "@xyflow/react"

/**
 * Minimal shape of a next-safe-action `executeAsync` result we depend on. Success
 * is signalled positively by `data.ok === true`; everything else (serverError, the
 * idle `{}` captured-throw shape, or a rejected promise -> `undefined`) is failure.
 */
export type DeleteSaveResult =
  | {
      data?: { ok?: boolean } | undefined
      serverError?: unknown
      validationErrors?: unknown
    }
  | undefined

export type DeleteNodeDeps = {
  /** Re-entrancy guard backed by a ref so rapid clicks can't race a stale closure. */
  isMutatingRef: { current: boolean }
  setIsFlowMutating: (value: boolean) => void
  /**
   * Cancels the pending autosave debounce. Load-bearing: a pending *pre-delete*
   * save still holds the node, and if it fired after our save it would write the
   * old node list back and resurrect the deleted node.
   */
  cancelAutosave: () => void
  /**
   * React Flow's `deleteElements`: removes the node plus its connected edges and
   * runs the edge-cleanup cascade. Owns the deletion, so the node is removed
   * optimistically before we persist.
   */
  deleteElements: (payload: { nodes: { id: string }[] }) => Promise<unknown>
  getNodes: () => FlowNode[]
  getEdges: () => Edge[]
  saveDraft: (input: {
    nodes: FlowNode[]
    edges: Edge[]
  }) => Promise<DeleteSaveResult>
  /** Invoked when the post-delete save did not durably succeed (e.g. error toast). */
  onError: () => void
}

/**
 * Persist-first node deletion. React Flow owns the delete cascade (removing the node
 * plus its connected edges and clearing dangling button refs), so the node is removed
 * optimistically; we then immediately await a draft save of the settled canvas
 * instead of letting the 1s autosave debounce persist it. This shrinks the
 * "delete then refresh -> node resurrects" window from ~1s to the save round-trip.
 *
 * On failure the node stays removed and an error toast fires; the post-delete
 * autosave the canvas change scheduled remains as an automatic retry.
 */
export function createDeleteNode(deps: DeleteNodeDeps) {
  return async (nodeId: string): Promise<void> => {
    if (deps.isMutatingRef.current) {
      return
    }
    deps.isMutatingRef.current = true
    deps.setIsFlowMutating(true)
    deps.cancelAutosave()

    await deps.deleteElements({ nodes: [{ id: nodeId }] })

    let result: DeleteSaveResult
    try {
      result = await deps.saveDraft({
        nodes: deps.getNodes(),
        edges: deps.getEdges(),
      })
    } catch {
      result = undefined
    }

    if (result?.data?.ok !== true) {
      deps.onError()
    }

    deps.setIsFlowMutating(false)
    deps.isMutatingRef.current = false
  }
}
