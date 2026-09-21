"use client"

import { createContext, type ReactNode, useContext, useRef } from "react"
import { useStore } from "zustand"
import {
  type ChatStore,
  type ChatStoreInitialState,
  createChatStore,
} from "./chat-store"

export type ChatStoreApi = ReturnType<typeof createChatStore>

export const ChatStoreContext = createContext<ChatStoreApi | undefined>(
  undefined,
)

export type ChatStoreProviderProps = {
  children: ReactNode
  initialState?: ChatStoreInitialState
}

export const ChatStoreProvider = ({
  children,
  initialState,
}: ChatStoreProviderProps) => {
  const storeRef = useRef<ChatStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createChatStore(initialState)
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
