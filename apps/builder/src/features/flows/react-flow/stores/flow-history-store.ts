import type { Edge, Node } from "@xyflow/react"
import { createStore } from "zustand"

export type Snapshot = { nodes: Node[]; edges: Edge[] }

/**
 * Applies a restored snapshot back onto the canvas. The wrapper registers its
 * local `useNodesState`/`useEdgesState` setters here so undo/redo write through
 * the *controlled* `nodes`/`edges` props. React Flow's `StoreUpdater` then syncs
 * those props into its internal store WITHOUT emitting `onNodesChange`/
 * `onEdgesChange` — so restoring never re-enters `takeSnapshot` and can't clobber
 * the redo (`future`) stack. Restoring via `useReactFlow().setNodes` would instead
 * round-trip through the change handlers and corrupt history.
 */
export type RestoreHandlers = {
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
}

const MAX_HISTORY = 50
const MAX_HISTORY_BYTES = 5.5 * 1024 * 1024

const cloneSnapshot = (snapshot: Snapshot): Snapshot =>
  JSON.parse(JSON.stringify(snapshot)) as Snapshot

const snapshotBytes = (snapshot: Snapshot) => JSON.stringify(snapshot).length

const appendPast = (past: Snapshot[], snapshot: Snapshot) => {
  const nextPast = [...past.slice(-MAX_HISTORY + 1), snapshot]
  let totalBytes = nextPast.reduce(
    (sum, entry) => sum + snapshotBytes(entry),
    0,
  )

  while (nextPast.length > 0 && totalBytes > MAX_HISTORY_BYTES) {
    const removed = nextPast.shift()
    if (!removed) {
      break
    }
    totalBytes -= snapshotBytes(removed)
  }

  return nextPast
}

export type FlowHistoryState = {
  past: Snapshot[]
  future: Snapshot[]
  restoreHandlers: RestoreHandlers | null
  branchClearedCount: number
}

export type FlowHistoryStore = FlowHistoryState & {
  takeSnapshot: (nodes: Node[], edges: Edge[]) => boolean
  undo: (current: Snapshot) => Snapshot | null
  redo: (current: Snapshot) => Snapshot | null
  reset: () => void
  setRestoreHandlers: (handlers: RestoreHandlers | null) => void
}

export const createFlowHistoryStore = () =>
  createStore<FlowHistoryStore>()((set, get) => {
    const applySnapshot = (snapshot: Snapshot) => {
      const { restoreHandlers } = get()
      if (!restoreHandlers) {
        return
      }
      // Clone before handing to React Flow so later in-place mutations of live
      // nodes/edges (several handlers mutate node data directly) don't corrupt
      // the copy still held in the history stacks.
      const restored = cloneSnapshot(snapshot)
      restoreHandlers.setNodes(restored.nodes)
      restoreHandlers.setEdges(restored.edges)
    }

    return {
      past: [],
      future: [],
      restoreHandlers: null,
      branchClearedCount: 0,

      takeSnapshot: (nodes, edges) => {
        const snapshot = cloneSnapshot({ nodes, edges })
        const hadRedoHistory = get().future.length > 0
        set((state) => ({
          past: appendPast(state.past, snapshot),
          future: [],
          branchClearedCount: hadRedoHistory
            ? state.branchClearedCount + 1
            : state.branchClearedCount,
        }))
        return hadRedoHistory
      },

      undo: (current) => {
        const { past } = get()
        const snapshot = past.at(-1)
        if (!snapshot) {
          return null
        }
        set((state) => ({
          past: state.past.slice(0, -1),
          future: [cloneSnapshot(current), ...state.future],
        }))
        applySnapshot(snapshot)
        return snapshot
      },

      redo: (current) => {
        const { future } = get()
        const snapshot = future[0]
        if (!snapshot) {
          return null
        }
        set((state) => ({
          future: state.future.slice(1),
          past: appendPast(state.past, cloneSnapshot(current)),
        }))
        applySnapshot(snapshot)
        return snapshot
      },

      reset: () => set({ past: [], future: [] }),

      setRestoreHandlers: (handlers) => set({ restoreHandlers: handlers }),
    }
  })
