"use client"

import { createContext, type ReactNode, useContext, useRef } from "react"
import { useStore } from "zustand"
import { createDripStore, type DripStore } from "./drip-store"

export type DripStoreApi = ReturnType<typeof createDripStore>

export const DripStoreContext = createContext<DripStoreApi | undefined>(
  undefined,
)

export type DripStoreProviderProps = {
  children: ReactNode
}

export const DripStoreProvider = ({ children }: DripStoreProviderProps) => {
  const storeRef = useRef<DripStoreApi>(undefined)

  if (!storeRef.current) {
    storeRef.current = createDripStore()
  }

  return (
    <DripStoreContext.Provider value={storeRef.current}>
      {children}
    </DripStoreContext.Provider>
  )
}

export const useDripStore = <T,>(selector: (store: DripStore) => T): T => {
  const context = useContext(DripStoreContext)

  if (!context) {
    throw new Error("useDripStore must be used within DripStoreProvider")
  }

  return useStore(context, selector)
}
