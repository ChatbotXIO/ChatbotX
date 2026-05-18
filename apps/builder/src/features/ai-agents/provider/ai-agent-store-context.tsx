"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import { type AIAgentStore, createAIAgentStore } from "./ai-agent-store"

export type AIAgentStoreApi = ReturnType<typeof createAIAgentStore>

export const AIAgentStoreContext = createContext<AIAgentStoreApi | undefined>(
  undefined,
)

export type AIAgentStoreProviderProps = {
  workspaceId: string
  children: ReactNode
  autoInitialize?: boolean
}

export const AIAgentStoreProvider = ({
  workspaceId,
  autoInitialize = true,
  children,
}: AIAgentStoreProviderProps) => {
  const storeRef = useRef<AIAgentStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createAIAgentStore({
      workspaceId,
    })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <AIAgentStoreContext.Provider value={storeRef.current}>
      {children}
    </AIAgentStoreContext.Provider>
  )
}

export const useAIAgentStore = <T,>(
  selector: (store: AIAgentStore) => T,
): T => {
  const aiAgentStoreContext = useContext(AIAgentStoreContext)

  if (!aiAgentStoreContext) {
    throw new Error("useAIAgentStore must be used within AIAgentStoreProvider")
  }

  return useStore(aiAgentStoreContext, selector)
}
