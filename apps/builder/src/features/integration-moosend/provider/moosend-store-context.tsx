"use client"

import { createContext, type ReactNode, useContext, useRef } from "react"
import { useStore } from "zustand"
import { createMoosendStore, type MoosendStore } from "./moosend-store"

export type MoosendStoreApi = ReturnType<typeof createMoosendStore>

export const MoosendStoreContext = createContext<MoosendStoreApi | undefined>(
  undefined,
)

export type MoosendStoreProviderProps = {
  children: ReactNode
}

export const MoosendStoreProvider = ({
  children,
}: MoosendStoreProviderProps) => {
  const storeRef = useRef<MoosendStoreApi>(undefined)

  if (!storeRef.current) {
    storeRef.current = createMoosendStore()
  }

  return (
    <MoosendStoreContext.Provider value={storeRef.current}>
      {children}
    </MoosendStoreContext.Provider>
  )
}

export const useMoosendStore = <T,>(
  selector: (store: MoosendStore) => T,
): T => {
  const context = useContext(MoosendStoreContext)

  if (!context) {
    throw new Error("useMoosendStore must be used within MoosendStoreProvider")
  }

  return useStore(context, selector)
}
