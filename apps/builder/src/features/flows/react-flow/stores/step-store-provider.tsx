"use client"

import { type ReactNode, createContext, useContext, useRef } from "react"
import { useStore } from "zustand"
import { type StepStore, createStepStore } from "./step-store"

export type StepStoreApi = ReturnType<typeof createStepStore>

export const StepStoreContext = createContext<StepStoreApi | undefined>(
  undefined,
)

export interface StepStoreProviderProps {
  children: ReactNode
}

export const StepStoreProvider = ({ children }: StepStoreProviderProps) => {
  const storeRef = useRef<StepStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createStepStore()
  }

  return (
    <StepStoreContext.Provider value={storeRef.current}>
      {children}
    </StepStoreContext.Provider>
  )
}

export const useStepStore = <T,>(selector: (store: StepStore) => T): T => {
  const stepStoreContext = useContext(StepStoreContext)

  if (!stepStoreContext) {
    throw new Error("useStepStore must be used within StepStoreProvider")
  }

  return useStore(stepStoreContext, selector)
}
