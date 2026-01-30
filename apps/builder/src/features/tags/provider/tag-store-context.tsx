"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import { createTagStore, type TagStore } from "./tag-store"

export type TagStoreApi = ReturnType<typeof createTagStore>

export const TagStoreContext = createContext<TagStoreApi | undefined>(undefined)

export type TagStoreProviderProps = {
  chatbotId: string
  children: ReactNode
  autoInitialize?: boolean
}

export const TagStoreProvider = ({
  chatbotId,
  autoInitialize = true,
  children,
}: TagStoreProviderProps) => {
  const storeRef = useRef<TagStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createTagStore({
      chatbotId,
    })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <TagStoreContext.Provider value={storeRef.current}>
      {children}
    </TagStoreContext.Provider>
  )
}

export const useTagStore = <T,>(selector: (store: TagStore) => T): T => {
  const tagStoreContext = useContext(TagStoreContext)

  if (!tagStoreContext) {
    throw new Error("useTagStore must be used within TagStoreProvider")
  }

  return useStore(tagStoreContext, selector)
}
