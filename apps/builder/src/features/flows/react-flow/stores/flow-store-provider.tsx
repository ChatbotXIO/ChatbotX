"use client"

import { type ReactNode, createContext, useContext, useRef } from "react"
import { useStore } from "zustand"
import { type FlowNode, type FlowStore, createFlowStore } from "./flow-store"
import type { Edge } from "@xyflow/react"

export type FlowStoreApi = ReturnType<typeof createFlowStore>

export const FlowStoreContext = createContext<FlowStoreApi | undefined>(
  undefined,
)

export interface FlowStoreProviderProps {
  nodes: FlowNode[]
  edges: Edge[]
  children: ReactNode
}

export const FlowStoreProvider = ({
  nodes,
  edges,
  children,
}: FlowStoreProviderProps) => {
  const storeRef = useRef<FlowStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createFlowStore({
      nodes,
      edges,
      activeNode: null,
    })
  }

  return (
    <FlowStoreContext.Provider value={storeRef.current}>
      {children}
    </FlowStoreContext.Provider>
  )
}

export const useFlowStore = <T,>(selector: (store: FlowStore) => T): T => {
  const flowStoreContext = useContext(FlowStoreContext)

  if (!flowStoreContext) {
    throw new Error("useFlowStore must be used within FlowStoreProvider")
  }

  return useStore(flowStoreContext, selector)
}
