"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import { type AIToolsStore, createAIToolsStore } from "./ai-tools-store"

export type AIToolsStoreApi = ReturnType<typeof createAIToolsStore>

export const AIToolsStoreContext = createContext<AIToolsStoreApi | undefined>(
  undefined,
)

export type AIToolsStoreProviderProps = {
  workspaceId: string
  children: ReactNode
  autoInitialize?: boolean
}

export const AIToolsStoreProvider = ({
  workspaceId,
  autoInitialize = true,
  children,
}: AIToolsStoreProviderProps) => {
  const storeRef = useRef<AIToolsStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createAIToolsStore({
      workspaceId,
    })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <AIToolsStoreContext.Provider value={storeRef.current}>
      {children}
    </AIToolsStoreContext.Provider>
  )
}

export const useAIToolsStore = <T,>(
  selector: (store: AIToolsStore) => T,
): T => {
  const aiToolsStoreContext = useContext(AIToolsStoreContext)

  if (!aiToolsStoreContext) {
    throw new Error("useAIToolsStore must be used within AIToolsStoreProvider")
  }

  return useStore(aiToolsStoreContext, selector)
}
