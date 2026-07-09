"use client"

import { createContext, type ReactNode, useContext, useRef } from "react"
import { useStore } from "zustand"
import {
  createFlowHistoryStore,
  type FlowHistoryStore,
} from "./flow-history-store"

export type FlowHistoryStoreApi = ReturnType<typeof createFlowHistoryStore>

export const FlowHistoryStoreContext = createContext<
  FlowHistoryStoreApi | undefined
>(undefined)

export const FlowHistoryStoreProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const storeRef = useRef<FlowHistoryStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createFlowHistoryStore()
  }

  return (
    <FlowHistoryStoreContext.Provider value={storeRef.current}>
      {children}
    </FlowHistoryStoreContext.Provider>
  )
}

/**
 * Returns the stable store API (identity-stable for the provider's lifetime).
 * Callers that need the *current* state inside an event handler should call
 * `api.getState()` at call time rather than subscribing, so reading transient
 * flags like `isRestoring` doesn't force a re-render on every history change.
 */
export const useFlowHistoryStoreApi = (): FlowHistoryStoreApi => {
  const context = useContext(FlowHistoryStoreContext)

  if (!context) {
    throw new Error(
      "useFlowHistoryStore must be used within FlowHistoryStoreProvider",
    )
  }

  return context
}

export const useFlowHistoryStore = <T,>(
  selector: (store: FlowHistoryStore) => T,
): T => useStore(useFlowHistoryStoreApi(), selector)
