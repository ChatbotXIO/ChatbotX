"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import { createFlowStore, type FlowStore } from "./flow-store"

export type FlowStoreApi = ReturnType<typeof createFlowStore>

export const FlowStoreContext = createContext<FlowStoreApi | undefined>(
  undefined,
)

export type FlowStoreProviderProps = {
  chatbotId: string
  children: ReactNode
  autoInitialize?: boolean
}

export const FlowStoreProvider = ({
  chatbotId,
  autoInitialize = true,
  children,
}: FlowStoreProviderProps) => {
  const storeRef = useRef<FlowStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createFlowStore({
      chatbotId,
    })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

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
