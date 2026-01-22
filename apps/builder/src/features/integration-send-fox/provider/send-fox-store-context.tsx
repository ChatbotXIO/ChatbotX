"use client"

import { createContext, type ReactNode, useContext, useRef } from "react"
import { useStore } from "zustand"
import { createSendFoxStore, type SendFoxStore } from "./send-fox-store"

export type SendFoxStoreApi = ReturnType<typeof createSendFoxStore>

export const SendFoxStoreContext = createContext<SendFoxStoreApi | undefined>(
  undefined,
)

export type SendFoxStoreProviderProps = {
  children: ReactNode
}

export const SendFoxStoreProvider = ({
  children,
}: SendFoxStoreProviderProps) => {
  const storeRef = useRef<SendFoxStoreApi>(undefined)

  if (!storeRef.current) {
    storeRef.current = createSendFoxStore()
  }

  return (
    <SendFoxStoreContext.Provider value={storeRef.current}>
      {children}
    </SendFoxStoreContext.Provider>
  )
}

export const useSendFoxStore = <T,>(
  selector: (store: SendFoxStore) => T,
): T => {
  const context = useContext(SendFoxStoreContext)

  if (!context) {
    throw new Error("useSendFoxStore must be used within SendFoxStoreProvider")
  }

  return useStore(context, selector)
}
