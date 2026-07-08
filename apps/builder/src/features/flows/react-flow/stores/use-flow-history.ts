"use client"

import { type Edge, type Node, useReactFlow } from "@xyflow/react"
import { useCallback } from "react"
import {
  useFlowHistoryStore,
  useFlowHistoryStoreApi,
} from "./flow-history-store-provider"

type TakeSnapshot = {
  (): void
  (nodes: Node[], edges: Edge[]): void
}

export const useFlowHistory = () => {
  const { getEdges, getNodes } = useReactFlow()
  const store = useFlowHistoryStoreApi()
  const pastCount = useFlowHistoryStore((state) => state.past.length)
  const futureCount = useFlowHistoryStore((state) => state.future.length)
  const branchClearedCount = useFlowHistoryStore(
    (state) => state.branchClearedCount,
  )
  const canUndo = useFlowHistoryStore((state) => state.past.length > 0)
  const canRedo = useFlowHistoryStore((state) => state.future.length > 0)

  const takeSnapshot = useCallback(
    ((nodes?: Node[], edges?: Edge[]) => {
      store.getState().takeSnapshot(nodes ?? getNodes(), edges ?? getEdges())
    }) as TakeSnapshot,
    [store, getNodes, getEdges],
  )

  // Restoration is applied inside the store via the wrapper-registered handlers
  // (its local useNodesState/useEdgesState setters), so undo/redo never round-trip
  // through onNodesChange and can't clear the redo stack.
  const undo = useCallback(() => {
    store.getState().undo({ nodes: getNodes(), edges: getEdges() })
  }, [store, getNodes, getEdges])

  const redo = useCallback(() => {
    store.getState().redo({ nodes: getNodes(), edges: getEdges() })
  }, [store, getNodes, getEdges])

  const reset = useCallback(() => {
    store.getState().reset()
  }, [store])

  return {
    branchClearedCount,
    canRedo,
    canUndo,
    futureCount,
    pastCount,
    redo,
    reset,
    takeSnapshot,
    undo,
  }
}
