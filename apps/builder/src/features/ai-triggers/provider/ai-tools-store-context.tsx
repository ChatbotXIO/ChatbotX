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
  chatbotId: string
  children: ReactNode
  autoInitialize?: boolean
}

export const AIToolsStoreProvider = ({
  chatbotId,
  autoInitialize = true,
  children,
}: AIToolsStoreProviderProps) => {
  const storeRef = useRef<AIToolsStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createAIToolsStore()
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize && chatbotId) {
      const state = storeRef.current.getState()
      // Only fetch if not already initialized for this chatbotId
      if (!state.initialized || state.chatbotId !== chatbotId) {
        state.fetchTools(chatbotId)
      }
    }
  }, [chatbotId, autoInitialize])

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
