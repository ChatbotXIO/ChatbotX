"use client"

import { createContext, type ReactNode, useContext, useRef } from "react"
import { useStore } from "zustand"
import { createSendGridStore, type SendGridStore } from "./sendgrid-store"

export type SendGridStoreApi = ReturnType<typeof createSendGridStore>

export const SendGridStoreContext = createContext<SendGridStoreApi | undefined>(
  undefined,
)

export type SendGridStoreProviderProps = {
  children: ReactNode
}

export const SendGridStoreProvider = ({
  children,
}: SendGridStoreProviderProps) => {
  const storeRef = useRef<SendGridStoreApi>(undefined)

  if (!storeRef.current) {
    storeRef.current = createSendGridStore()
  }

  return (
    <SendGridStoreContext.Provider value={storeRef.current}>
      {children}
    </SendGridStoreContext.Provider>
  )
}

export const useSendGridStore = <T,>(
  selector: (store: SendGridStore) => T,
): T => {
  const context = useContext(SendGridStoreContext)

  if (!context) {
    throw new Error(
      "useSendGridStore must be used within SendGridStoreProvider",
    )
  }

  return useStore(context, selector)
}
