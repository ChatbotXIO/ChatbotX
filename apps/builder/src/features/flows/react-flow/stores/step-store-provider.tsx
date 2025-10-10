"use client"

import { createContext, type ReactNode, useContext, useRef } from "react"
import { useStore } from "zustand"
import { createStepStore, type StepStore } from "./step-store"

export type StepStoreApi = ReturnType<typeof createStepStore>

export const StepStoreContext = createContext<StepStoreApi | undefined>(
  undefined,
)

export type StepStoreProviderProps = {
  children: ReactNode
  initialState?: Partial<StepStore>
}

export const StepStoreProvider = ({
  children,
  initialState,
}: StepStoreProviderProps) => {
  const storeRef = useRef<StepStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createStepStore(initialState)
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
