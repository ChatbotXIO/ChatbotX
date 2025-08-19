"use client"

import { createContext, type ReactNode, useContext, useRef } from "react"
import { useStore } from "zustand"
import { type ChatStore, createChatStore } from "./chat-store"

export type ChatStoreApi = ReturnType<typeof createChatStore>

export const ChatStoreContext = createContext<ChatStoreApi | undefined>(
  undefined,
)

export type ChatStoreProviderProps = {
  children: ReactNode
}

export const ChatStoreProvider = ({ children }: ChatStoreProviderProps) => {
  const storeRef = useRef<ChatStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createChatStore()
  }

  return (
    <ChatStoreContext.Provider value={storeRef.current}>
      {children}
    </ChatStoreContext.Provider>
  )
}

export const useChatStore = <T,>(selector: (store: ChatStore) => T): T => {
  const chatStoreContext = useContext(ChatStoreContext)

  if (!chatStoreContext) {
    throw new Error("useChatStore must be used within ChatStoreProvider")
  }

  return useStore(chatStoreContext, selector)
}
