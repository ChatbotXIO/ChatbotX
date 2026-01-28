"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import { createInboxStore, type InboxStore } from "./inbox-store"

export type InboxStoreApi = ReturnType<typeof createInboxStore>

export const InboxStoreContext = createContext<InboxStoreApi | undefined>(
  undefined,
)

export type InboxStoreProviderProps = {
  chatbotId: string
  children: ReactNode
  autoInitialize?: boolean
}

export const InboxStoreProvider = ({
  chatbotId,
  autoInitialize = true,
  children,
}: InboxStoreProviderProps) => {
  const storeRef = useRef<InboxStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createInboxStore({
      chatbotId,
    })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <InboxStoreContext.Provider value={storeRef.current}>
      {children}
    </InboxStoreContext.Provider>
  )
}

export const useInboxStore = <T,>(selector: (store: InboxStore) => T): T => {
  const inboxStoreContext = useContext(InboxStoreContext)

  if (!inboxStoreContext) {
    throw new Error("useInboxStore must be used within InboxStoreProvider")
  }

  return useStore(inboxStoreContext, selector)
}
