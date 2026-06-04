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
  type?: "dashboard" | "reflinks" | "magic-links"
  defaultSearchParams: { [x: string]: string }
  children: ReactNode
  autoInitialize?: boolean
}

export const AnalysisStoreProvider = ({
  children,
  autoInitialize = true,
  type = "dashboard",
  defaultSearchParams,
}: AnalysisStoreProviderProps) => {
  const storeRef = useRef<AnalysisStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createAnalysisStore({ type, defaultSearchParams })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <AnalysisStoreContext.Provider value={storeRef.current}>
      {children}
    </AnalysisStoreContext.Provider>
  )
}

export const useAnalysisStore = <T,>(
  selector: (store: AnalysisStore) => T,
): T => {
  const analysisStoreContext = useContext(AnalysisStoreContext)

  if (!analysisStoreContext) {
    throw new Error(
      "useAnalysisStore must be used within AnalysisStoreProvider",
    )
  }

  return useStore(analysisStoreContext, selector)
}
