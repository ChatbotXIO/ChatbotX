"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import { type AnalysisStore, createAnalysisStore } from "./analysis-store"

export type AnalysisStoreApi = ReturnType<typeof createAnalysisStore>

export const AnalysisStoreContext = createContext<AnalysisStoreApi | undefined>(
  undefined,
)

export type AnalysisStoreProviderProps = {
  chatbotId: string
  children: ReactNode
}

export const AnalysisStoreProvider = ({
  chatbotId,
  children,
}: AnalysisStoreProviderProps) => {
  const storeRef = useRef<AnalysisStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createAnalysisStore()
  }

  useEffect(() => {
    if (storeRef.current) {
      storeRef.current.setState({ chatbotId })
    }
  }, [chatbotId])

  return (
    <AnalysisStoreContext.Provider value={storeRef.current}>
      {children}
    </AnalysisStoreContext.Provider>
  )
}

export const useAnalysisStore = <T,>(
  selector: (store: AnalysisStore) => T,
): T => {
  const customFieldStoreContext = useContext(AnalysisStoreContext)

  if (!customFieldStoreContext) {
    throw new Error(
      "useAnalysisStore must be used within AnalysisStoreProvider",
    )
  }

  return useStore(customFieldStoreContext, selector)
}
